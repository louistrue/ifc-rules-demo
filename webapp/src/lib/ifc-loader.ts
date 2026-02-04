/**
 * IFC Loader - Handles parsing and on-demand data extraction
 *
 * Strategy for small-mid models (< 50MB):
 * - Parse file (geometry streams immediately)
 * - Extract ALL properties/materials/classifications in one pass
 * - Build complete schema for autocomplete
 * - Total time: parse + extraction (~1-3 seconds for 10-50MB)
 *
 * This "eager load" approach means:
 * - Zero friction for users (no "load properties" button)
 * - Autocomplete works instantly
 * - Rule evaluation is fast (data already in memory)
 */

import type { ElementIndex } from '../../../src/core/types';
import type { IfcFileSchema } from './schema-extractor';

// ============================================================================
// Types
// ============================================================================

export interface LoadProgress {
  phase: 'parsing' | 'geometry' | 'properties' | 'materials' | 'classifications' | 'indexing' | 'complete';
  percent: number;
  message: string;
}

export interface LoadResult {
  index: ElementIndex;
  schema: IfcFileSchema;
  stats: {
    parseTime: number;
    extractionTime: number;
    totalElements: number;
    propertySets: number;
    materials: number;
    classifications: number;
  };
}

export type ProgressCallback = (progress: LoadProgress) => void;

// ============================================================================
// Size thresholds
// ============================================================================

const SIZE_THRESHOLDS = {
  // < 10MB: Instant extraction
  SMALL: 10 * 1024 * 1024,
  // < 50MB: Eager extraction (recommended for this demo)
  MEDIUM: 50 * 1024 * 1024,
  // > 50MB: Consider progressive loading (future)
  LARGE: 50 * 1024 * 1024,
};

// ============================================================================
// Main Loader
// ============================================================================

/**
 * Load and fully extract an IFC file
 *
 * For small-mid models, this extracts everything upfront for
 * instant autocomplete in the rule builder.
 */
export async function loadIfcFile(
  buffer: ArrayBuffer,
  onProgress?: ProgressCallback
): Promise<LoadResult> {
  const startTime = performance.now();

  const report = (phase: LoadProgress['phase'], percent: number, message: string) => {
    onProgress?.({ phase, percent, message });
  };

  // ==========================================================================
  // Phase 1: Parse IFC file
  // ==========================================================================

  report('parsing', 0, 'Parsing IFC file...');

  // Import ifc-lite parser dynamically
  const { IfcParser } = await import('@ifc-lite/parser');
  const parser = new IfcParser();

  const parseResult = await parser.parse(buffer, {
    onProgress: ({ phase, percent }) => {
      if (phase === 'tokenizing') {
        report('parsing', percent * 0.3, 'Tokenizing...');
      } else if (phase === 'decoding') {
        report('parsing', 30 + percent * 0.2, 'Decoding entities...');
      } else if (phase === 'geometry') {
        report('geometry', 50 + percent * 0.2, 'Processing geometry...');
      }
    },
  });

  const parseTime = performance.now() - startTime;
  report('properties', 70, `Parsed ${parseResult.entityCount} entities`);

  // ==========================================================================
  // Phase 2: Extract properties (on-demand trigger)
  // ==========================================================================

  report('properties', 72, 'Extracting properties...');

  // ifc-lite extracts on-demand, so we trigger extraction for all elements
  // This is efficient because it's done in WASM
  const {
    PropertyExtractor,
  } = await import('@ifc-lite/parser');

  const propertyExtractor = new PropertyExtractor(parseResult.entities);
  const propertySets = await propertyExtractor.extractPropertySetsAsync();

  report('properties', 78, `Found ${propertySets.size} property sets`);

  // ==========================================================================
  // Phase 3: Extract relationships (already in parseResult)
  // ==========================================================================

  report('properties', 80, 'Building relationships...');

  // Relationships are already extracted during parse
  const relationships = parseResult.relationships;

  // ==========================================================================
  // Phase 4: Extract materials
  // ==========================================================================

  report('materials', 85, 'Extracting materials...');

  const { extractMaterials } = await import('@ifc-lite/parser');
  const materials = extractMaterials(parseResult.entities, parseResult.entityIndex.byType);

  report('materials', 88, `Found ${materials.materials.size} materials`);

  // ==========================================================================
  // Phase 5: Extract classifications
  // ==========================================================================

  report('classifications', 90, 'Extracting classifications...');

  const { extractClassifications } = await import('@ifc-lite/parser');
  const classifications = extractClassifications(parseResult.entities, parseResult.entityIndex.byType);

  report('classifications', 93, `Found ${classifications.classifications.size} systems`);

  // ==========================================================================
  // Phase 6: Build simplified index directly from parse result
  // ==========================================================================

  report('indexing', 95, 'Building element index...');

  // Build a simplified index from the parse result
  const index = buildSimplifiedIndex(parseResult, propertySets, relationships);

  // ==========================================================================
  // Phase 7: Extract schema for autocomplete
  // ==========================================================================

  report('indexing', 99, 'Preparing autocomplete data...');

  const schema = buildSimplifiedSchema(parseResult, propertySets, materials as any, classifications as any);

  const extractionTime = performance.now() - startTime - parseTime;

  // ==========================================================================
  // Complete
  // ==========================================================================

  report('complete', 100, 'Ready!');

  return {
    index,
    schema,
    stats: {
      parseTime,
      extractionTime,
      totalElements: index.elements.size,
      propertySets: propertySets.size,
      materials: materials.materials.size,
      classifications: classifications.classifications.size,
    },
  };
}

// ============================================================================
// Simplified Index Builder (works with actual parse result)
// ============================================================================

import type { ParseResult, PropertySet as ParserPropertySet, Relationship } from '@ifc-lite/parser';

/**
 * Helper to extract attribute value from entity
 * Handles both object-style and array-style attributes from ifc-lite
 */
function getAttributeValue(attributes: unknown, key: string): unknown {
  if (!attributes) return undefined;

  // If attributes is an object with named keys
  if (typeof attributes === 'object' && !Array.isArray(attributes)) {
    return (attributes as Record<string, unknown>)[key];
  }

  // If attributes is an array, use positional mapping for common IFC attributes
  // IFC entity attributes follow a standard order: GlobalId, OwnerHistory, Name, Description, etc.
  if (Array.isArray(attributes)) {
    const positionMap: Record<string, number> = {
      'GlobalId': 0,
      'Name': 2,
      'Description': 3,
      'ObjectType': 4,
      'Tag': 5,
      'PredefinedType': 8, // Position varies by entity type
    };
    const pos = positionMap[key];
    if (pos !== undefined && pos < attributes.length) {
      const val = attributes[pos];
      // Handle IFC value wrappers
      if (val && typeof val === 'object' && 'value' in val) {
        return val.value;
      }
      return val;
    }
  }

  return undefined;
}

/**
 * Build a simplified ElementIndex from parse result
 */
function buildSimplifiedIndex(
  parseResult: ParseResult,
  propertySets: Map<number, ParserPropertySet>,
  relationships: Relationship[]
): ElementIndex {
  const elements = new Map<number, any>();
  const byType = new Map<string, Set<number>>();

  // Build elements map and byType index
  for (const [expressId, entity] of parseResult.entities) {
    // Only include building elements (skip relationships, property sets, etc.)
    if (isBuildingElement(entity.type)) {
      // Create element conforming to UnifiedElement interface
      elements.set(expressId, {
        expressId,
        globalId: getAttributeValue(entity.attributes, 'GlobalId') || '',
        type: entity.type,
        inheritanceChain: getInheritanceChain(entity.type),
        predefinedType: getAttributeValue(entity.attributes, 'PredefinedType') || undefined,
        objectType: getAttributeValue(entity.attributes, 'ObjectType') || undefined,
        name: getAttributeValue(entity.attributes, 'Name') || undefined,
        description: getAttributeValue(entity.attributes, 'Description') || undefined,
        tag: getAttributeValue(entity.attributes, 'Tag') || undefined,
        spatial: {},
        properties: {}, // Use object, not Map
        quantities: {},
        classifications: [],
        relationships: {},
      });

      // Add to byType index (use Set for consistency with ElementIndex interface)
      let typeSet = byType.get(entity.type);
      if (!typeSet) {
        typeSet = new Set();
        byType.set(entity.type, typeSet);
      }
      typeSet.add(expressId);
    }
  }

  // Map property sets to elements via relationships
  const relDefinesByProperties = relationships.filter(r => r.type === 'IFCRELDEFINESBYPROPERTIES');
  for (const rel of relDefinesByProperties) {
    const psetId = rel.relatingObject;
    const pset = propertySets.get(psetId);
    if (pset) {
      for (const elementId of rel.relatedObjects) {
        const element = elements.get(elementId);
        if (element) {
          // Convert pset.properties from Map to plain object
          const propsObj: Record<string, { value: unknown; type?: string }> = {};
          if (pset.properties instanceof Map) {
            for (const [propName, propValue] of pset.properties) {
              const pv = propValue as { value?: unknown; type?: string };
              propsObj[propName] = { value: pv?.value, type: pv?.type };
            }
          } else if (typeof pset.properties === 'object' && pset.properties !== null) {
            // Already an object
            for (const [propName, propValue] of Object.entries(pset.properties)) {
              const pv = propValue as { value?: unknown; type?: string };
              propsObj[propName] = { value: pv?.value, type: pv?.type };
            }
          }
          element.properties[pset.name] = propsObj;
        }
      }
    }
  }

  console.log('[Index] Built index with', elements.size, 'elements,', byType.size, 'types');

  return {
    elements,
    byType,
    byStorey: new Map(),
    byClassification: new Map(),
    byMaterial: new Map(),
    propertySets: new Set(Array.from(propertySets.values()).map(p => p.name)),
    classificationSystems: new Set(),
    get: (id: number) => elements.get(id),
    getByType: (type: string) => {
      const ids = byType.get(type);
      if (!ids) return [];
      return Array.from(ids).map(id => elements.get(id)).filter(Boolean);
    },
    [Symbol.iterator]: function* () {
      for (const element of elements.values()) {
        yield element;
      }
    },
  } as ElementIndex;
}

/**
 * Get inheritance chain for an IFC type (simplified)
 */
function getInheritanceChain(type: string): string[] {
  const upperType = type.toUpperCase();

  // Simplified IFC inheritance - map types to their parent chain
  const inheritance: Record<string, string[]> = {
    // Walls
    'IFCWALL': ['IfcWall', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCWALLSTANDARDCASE': ['IfcWallStandardCase', 'IfcWall', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCCURTAINWALL': ['IfcCurtainWall', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Openings
    'IFCDOOR': ['IfcDoor', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCWINDOW': ['IfcWindow', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Slabs
    'IFCSLAB': ['IfcSlab', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCROOF': ['IfcRoof', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Structural
    'IFCCOLUMN': ['IfcColumn', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCBEAM': ['IfcBeam', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCMEMBER': ['IfcMember', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCPLATE': ['IfcPlate', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCFOOTING': ['IfcFooting', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCPILE': ['IfcPile', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Circulation
    'IFCSTAIR': ['IfcStair', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCSTAIRFLIGHT': ['IfcStairFlight', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCRAMP': ['IfcRamp', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCRAMPFLIGHT': ['IfcRampFlight', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCRAILING': ['IfcRailing', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Covering
    'IFCCOVERING': ['IfcCovering', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCBUILDINGELEMENTPROXY': ['IfcBuildingElementProxy', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Furnishing
    'IFCFURNISHINGELEMENT': ['IfcFurnishingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCFURNITURE': ['IfcFurniture', 'IfcFurnishingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Spatial
    'IFCSPACE': ['IfcSpace', 'IfcSpatialStructureElement', 'IfcSpatialElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCZONE': ['IfcZone', 'IfcSystem', 'IfcGroup', 'IfcObject', 'IfcRoot'],
    'IFCSITE': ['IfcSite', 'IfcSpatialStructureElement', 'IfcSpatialElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCBUILDING': ['IfcBuilding', 'IfcSpatialStructureElement', 'IfcSpatialElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCBUILDINGSTOREY': ['IfcBuildingStorey', 'IfcSpatialStructureElement', 'IfcSpatialElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Opening
    'IFCOPENINGELEMENT': ['IfcOpeningElement', 'IfcFeatureElementSubtraction', 'IfcFeatureElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Distribution/MEP
    'IFCDISTRIBUTIONELEMENT': ['IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCDISTRIBUTIONCONTROLELEMENT': ['IfcDistributionControlElement', 'IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCDISTRIBUTIONFLOWELEMENT': ['IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCFLOWSEGMENT': ['IfcFlowSegment', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCFLOWTERMINAL': ['IfcFlowTerminal', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCFLOWCONTROLLER': ['IfcFlowController', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCFLOWFITTING': ['IfcFlowFitting', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
    'IFCENERGYCONVERSIONDEVICE': ['IfcEnergyConversionDevice', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],

    // Transport
    'IFCTRANSPORTELEMENT': ['IfcTransportElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
  };

  return inheritance[upperType] || [type, 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'];
}

/**
 * Check if entity type is a building element
 */
function isBuildingElement(type: string): boolean {
  const buildingElementTypes = [
    'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCURTAINWALL',
    'IFCDOOR', 'IFCWINDOW',
    'IFCSLAB', 'IFCROOF',
    'IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER',
    'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCRAMP', 'IFCRAMPFLIGHT',
    'IFCRAILING', 'IFCPLATE',
    'IFCFOOTING', 'IFCPILE', 'IFCFOUNDATION',
    'IFCCOVERING', 'IFCBUILDINGELEMENTPROXY',
    'IFCFURNISHINGELEMENT', 'IFCFURNITURE',
    'IFCSPACE', 'IFCZONE',
    'IFCOPENINGELEMENT',
    'IFCDISTRIBUTIONELEMENT', 'IFCDISTRIBUTIONCONTROLELEMENT', 'IFCDISTRIBUTIONFLOWELEMENT',
    'IFCFLOWSEGMENT', 'IFCFLOWTERMINAL', 'IFCFLOWCONTROLLER', 'IFCFLOWFITTING',
    'IFCELECTRICALELEMENT', 'IFCENERGYCONVERSIONDEVICE',
    'IFCTRANSPORTELEMENT',
    'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY',
  ];
  return buildingElementTypes.includes(type.toUpperCase());
}

/**
 * Build simplified schema for autocomplete
 */
function buildSimplifiedSchema(
  parseResult: ParseResult,
  propertySets: Map<number, ParserPropertySet>,
  materials: { materials: Map<string, any> },
  _classifications: { classifications: Map<string, any> }
): IfcFileSchema {
  // Count entities by type
  const typeCounts = new Map<string, number>();
  for (const entity of parseResult.entities.values()) {
    if (isBuildingElement(entity.type)) {
      typeCounts.set(entity.type, (typeCounts.get(entity.type) || 0) + 1);
    }
  }

  // Build entity types list
  const entityTypes = Array.from(typeCounts.entries())
    .map(([type, count]) => ({
      type,
      count,
      hasSubtypes: type.includes('Wall') || type.includes('Slab'),
    }))
    .sort((a, b) => b.count - a.count);

  // Build property sets schema
  const psetSchema: IfcFileSchema['propertySets'] = [];
  const psetNameCounts = new Map<string, { count: number; props: Map<string, { values: any[]; type: string }> }>();

  for (const pset of propertySets.values()) {
    const existing = psetNameCounts.get(pset.name);
    if (existing) {
      existing.count++;
      // Merge properties
      for (const [propName, propValue] of pset.properties) {
        const propData = existing.props.get(propName);
        if (propData) {
          propData.values.push(propValue.value);
        } else {
          existing.props.set(propName, { values: [propValue.value], type: propValue.type });
        }
      }
    } else {
      const props = new Map<string, { values: any[]; type: string }>();
      for (const [propName, propValue] of pset.properties) {
        props.set(propName, { values: [propValue.value], type: propValue.type });
      }
      psetNameCounts.set(pset.name, { count: 1, props });
    }
  }

  for (const [name, data] of psetNameCounts) {
    const properties = Array.from(data.props.entries()).map(([propName, propData]) => {
      // Count unique values
      const valueCounts = new Map<any, number>();
      for (const v of propData.values) {
        valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
      }
      return {
        name: propName,
        valueType: propData.type as any,
        values: Array.from(valueCounts.entries()).map(([value, count]) => ({ value, count })),
        frequency: propData.values.length,
      };
    });

    psetSchema.push({
      name,
      appliesTo: [],
      elementCount: data.count,
      properties,
    });
  }

  // ==========================================================================
  // Extract storeys from spatial structure
  // ==========================================================================

  const storeys: Array<{ name: string; elevation: number; elementCount: number }> = [];
  const storeyElementCounts = new Map<number, number>(); // storeyId -> element count

  // Find all IfcBuildingStorey entities
  const storeyEntities: Array<{ id: number; name: string; elevation: number }> = [];
  for (const [expressId, entity] of parseResult.entities) {
    if (entity.type.toUpperCase() === 'IFCBUILDINGSTOREY') {
      const name = getAttributeValue(entity.attributes, 'Name') as string || `Storey ${expressId}`;
      // Elevation is typically at position 9 for IfcBuildingStorey
      let elevation = 0;
      if (Array.isArray(entity.attributes) && entity.attributes.length > 9) {
        const elevVal = entity.attributes[9];
        if (typeof elevVal === 'number') {
          elevation = elevVal;
        } else if (elevVal && typeof elevVal === 'object' && 'value' in elevVal) {
          elevation = Number(elevVal.value) || 0;
        }
      }
      storeyEntities.push({ id: expressId, name, elevation });
      storeyElementCounts.set(expressId, 0);
    }
  }

  // Count elements per storey via IfcRelContainedInSpatialStructure
  const containmentRels = parseResult.relationships.filter(
    r => r.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE'
  );

  for (const rel of containmentRels) {
    const storeyId = rel.relatingObject;
    if (storeyElementCounts.has(storeyId)) {
      const currentCount = storeyElementCounts.get(storeyId) || 0;
      storeyElementCounts.set(storeyId, currentCount + rel.relatedObjects.length);
    }
  }

  // Build storeys array sorted by elevation
  for (const storey of storeyEntities) {
    storeys.push({
      name: storey.name,
      elevation: storey.elevation,
      elementCount: storeyElementCounts.get(storey.id) || 0,
    });
  }
  storeys.sort((a, b) => a.elevation - b.elevation);

  console.log('[Schema] Found', storeys.length, 'storeys:', storeys.map(s => s.name));
  console.log('[Schema] Found', psetSchema.length, 'property sets');

  return {
    totalElements: typeCounts.size > 0 ? Array.from(typeCounts.values()).reduce((a, b) => a + b, 0) : 0,
    entityTypes,
    propertySets: psetSchema.sort((a, b) => b.elementCount - a.elementCount),
    spatial: {
      projects: [],
      sites: [],
      buildings: [],
      storeys,
      spaces: [],
    },
    materials: Array.from(materials.materials.entries()).map(([name, data]) => ({
      name,
      type: 'single' as const,
      elementCount: data.elementCount || 0,
    })),
    classifications: [],
    quantitySets: [],
    lookup: {
      typesByCount: entityTypes.slice(0, 10),
      propertiesByFrequency: [],
      storeysByElevation: storeys.map(s => ({ name: s.name, elevation: s.elevation })),
    },
  };
}

/**
 * Estimate load time based on file size
 */
export function estimateLoadTime(fileSize: number): string {
  if (fileSize < SIZE_THRESHOLDS.SMALL) {
    return '< 1 second';
  } else if (fileSize < SIZE_THRESHOLDS.MEDIUM) {
    return '1-3 seconds';
  } else {
    return '3-10 seconds';
  }
}

/**
 * Check if file size is suitable for eager loading
 */
export function shouldEagerLoad(fileSize: number): boolean {
  return fileSize < SIZE_THRESHOLDS.LARGE;
}

// ============================================================================
// Simplified loader for demos (mock ifc-lite when not available)
// ============================================================================

/**
 * Demo loader that works without actual ifc-lite
 * Creates mock data structure for UI development
 */
export async function loadIfcFileDemo(
  _buffer: ArrayBuffer,
  onProgress?: ProgressCallback
): Promise<LoadResult> {
  const report = (phase: LoadProgress['phase'], percent: number, message: string) => {
    onProgress?.({ phase, percent, message });
  };

  // Simulate loading phases
  report('parsing', 0, 'Parsing IFC file...');
  await delay(300);

  report('parsing', 30, 'Decoding entities...');
  await delay(200);

  report('geometry', 50, 'Processing geometry...');
  await delay(300);

  report('properties', 70, 'Extracting properties...');
  await delay(200);

  report('materials', 85, 'Extracting materials...');
  await delay(100);

  report('classifications', 90, 'Extracting classifications...');
  await delay(100);

  report('indexing', 95, 'Building index...');
  await delay(100);

  report('complete', 100, 'Ready!');

  // Return mock data
  return createMockLoadResult();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create mock data for UI development
 */
function createMockLoadResult(): LoadResult {
  const mockSchema: IfcFileSchema = {
    totalElements: 1247,
    entityTypes: [
      { type: 'IfcWall', count: 127, hasSubtypes: true },
      { type: 'IfcWallStandardCase', count: 89, hasSubtypes: false },
      { type: 'IfcDoor', count: 45, hasSubtypes: false },
      { type: 'IfcWindow', count: 63, hasSubtypes: false },
      { type: 'IfcSlab', count: 24, hasSubtypes: false },
      { type: 'IfcColumn', count: 34, hasSubtypes: false },
      { type: 'IfcBeam', count: 56, hasSubtypes: false },
      { type: 'IfcSpace', count: 42, hasSubtypes: false },
      { type: 'IfcStair', count: 8, hasSubtypes: false },
      { type: 'IfcRailing', count: 16, hasSubtypes: false },
    ],
    propertySets: [
      {
        name: 'Pset_WallCommon',
        appliesTo: ['IfcWall', 'IfcWallStandardCase'],
        elementCount: 127,
        properties: [
          {
            name: 'IsExternal',
            valueType: 'boolean',
            values: [{ value: true, count: 89 }, { value: false, count: 38 }],
            frequency: 127,
          },
          {
            name: 'LoadBearing',
            valueType: 'boolean',
            values: [{ value: true, count: 45 }, { value: false, count: 82 }],
            frequency: 127,
          },
          {
            name: 'FireRating',
            valueType: 'string',
            values: [
              { value: '60', count: 32 },
              { value: '90', count: 18 },
              { value: '120', count: 12 },
              { value: null, count: 65 },
            ],
            frequency: 62,
          },
        ],
      },
      {
        name: 'Pset_DoorCommon',
        appliesTo: ['IfcDoor'],
        elementCount: 45,
        properties: [
          {
            name: 'IsExternal',
            valueType: 'boolean',
            values: [{ value: true, count: 12 }, { value: false, count: 33 }],
            frequency: 45,
          },
          {
            name: 'FireRating',
            valueType: 'number',
            values: [
              { value: 30, count: 18 },
              { value: 60, count: 8 },
              { value: 0, count: 19 },
            ],
            frequency: 45,
          },
        ],
      },
      {
        name: 'Pset_SlabCommon',
        appliesTo: ['IfcSlab'],
        elementCount: 24,
        properties: [
          {
            name: 'IsExternal',
            valueType: 'boolean',
            values: [{ value: true, count: 4 }, { value: false, count: 20 }],
            frequency: 24,
          },
        ],
      },
    ],
    spatial: {
      projects: ['Sample Project'],
      sites: ['Default Site'],
      buildings: [
        {
          name: 'Building A',
          storeys: [
            { name: 'Basement', elevation: -3.0, elementCount: 89 },
            { name: 'Ground Floor', elevation: 0.0, elementCount: 245 },
            { name: 'Level 1', elevation: 3.5, elementCount: 312 },
            { name: 'Level 2', elevation: 7.0, elementCount: 287 },
            { name: 'Roof', elevation: 10.5, elementCount: 54 },
          ],
          elementCount: 987,
        },
      ],
      storeys: [
        { name: 'Basement', elevation: -3.0, elementCount: 89 },
        { name: 'Ground Floor', elevation: 0.0, elementCount: 245 },
        { name: 'Level 1', elevation: 3.5, elementCount: 312 },
        { name: 'Level 2', elevation: 7.0, elementCount: 287 },
        { name: 'Roof', elevation: 10.5, elementCount: 54 },
      ],
      spaces: [
        { name: 'Office 101', storey: 'Level 1', area: 45.2 },
        { name: 'Meeting Room', storey: 'Level 1', area: 32.5 },
        { name: 'Corridor', storey: 'Level 1', area: 28.0 },
      ],
    },
    materials: [
      { name: 'Concrete C30/37', type: 'single', elementCount: 156 },
      { name: 'Brick - Common', type: 'single', elementCount: 89 },
      { name: 'Steel S355', type: 'single', elementCount: 67 },
      { name: 'Glass - Clear', type: 'single', elementCount: 63 },
      { name: 'Insulation - Mineral Wool', type: 'single', elementCount: 127 },
      { name: 'Exterior Wall Assembly', type: 'layerSet', elementCount: 45, thickness: { min: 0.3, max: 0.4 } },
    ],
    classifications: [
      {
        system: 'Uniclass 2015',
        elementCount: 423,
        codes: [
          { code: 'Ss_25_10_30', name: 'Concrete wall structures', elementCount: 45 },
          { code: 'Ss_25_10_50', name: 'Masonry wall structures', elementCount: 38 },
          { code: 'Ss_25_30_20', name: 'Concrete column structures', elementCount: 34 },
          { code: 'Pr_20_93_30', name: 'Doors', elementCount: 45 },
        ],
      },
    ],
    quantitySets: [
      {
        name: 'Qto_WallBaseQuantities',
        appliesTo: ['IfcWall'],
        quantities: [
          { name: 'GrossVolume', range: { min: 0.5, max: 12.3 }, frequency: 127 },
          { name: 'NetArea', range: { min: 2.1, max: 45.6 }, frequency: 127 },
          { name: 'Width', range: { min: 0.1, max: 0.4 }, frequency: 127 },
        ],
      },
    ],
    lookup: {
      typesByCount: [
        { type: 'IfcWall', count: 127 },
        { type: 'IfcWallStandardCase', count: 89 },
        { type: 'IfcWindow', count: 63 },
      ],
      propertiesByFrequency: [
        { pset: 'Pset_WallCommon', prop: 'IsExternal', frequency: 127 },
        { pset: 'Pset_WallCommon', prop: 'LoadBearing', frequency: 127 },
      ],
      storeysByElevation: [
        { name: 'Basement', elevation: -3.0 },
        { name: 'Ground Floor', elevation: 0.0 },
        { name: 'Level 1', elevation: 3.5 },
        { name: 'Level 2', elevation: 7.0 },
        { name: 'Roof', elevation: 10.5 },
      ],
    },
  };

  // Create mock index with actual mock elements for demo
  const mockElements = new Map<number, any>();
  const mockByType = new Map<string, Set<number>>();

  // Create mock wall elements
  for (let i = 1; i <= 127; i++) {
    const expressId = 1000 + i;
    mockElements.set(expressId, {
      expressId,
      globalId: `wall-${i}`,
      type: 'IFCWALL',
      inheritanceChain: ['IfcWall', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
      name: `Wall ${i}`,
      spatial: { storey: i <= 30 ? 'Ground Floor' : i <= 70 ? 'Level 1' : 'Level 2' },
      properties: {
        'Pset_WallCommon': {
          'IsExternal': { value: i <= 89, type: 'boolean' },
          'LoadBearing': { value: i <= 45, type: 'boolean' },
          'FireRating': { value: i <= 32 ? '60' : i <= 50 ? '90' : i <= 62 ? '120' : null, type: 'string' },
        },
      },
      quantities: {},
      classifications: [],
      relationships: {},
    });

    if (!mockByType.has('IFCWALL')) mockByType.set('IFCWALL', new Set());
    mockByType.get('IFCWALL')!.add(expressId);
  }

  // Create mock door elements
  for (let i = 1; i <= 45; i++) {
    const expressId = 2000 + i;
    mockElements.set(expressId, {
      expressId,
      globalId: `door-${i}`,
      type: 'IFCDOOR',
      inheritanceChain: ['IfcDoor', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
      name: `Door ${i}`,
      spatial: {},
      properties: {
        'Pset_DoorCommon': {
          'IsExternal': { value: i <= 12, type: 'boolean' },
          'FireRating': { value: i <= 18 ? 30 : i <= 26 ? 60 : 0, type: 'number' },
        },
      },
      quantities: {},
      classifications: [],
      relationships: {},
    });

    if (!mockByType.has('IFCDOOR')) mockByType.set('IFCDOOR', new Set());
    mockByType.get('IFCDOOR')!.add(expressId);
  }

  // Create mock window elements
  for (let i = 1; i <= 63; i++) {
    const expressId = 3000 + i;
    mockElements.set(expressId, {
      expressId,
      globalId: `window-${i}`,
      type: 'IFCWINDOW',
      inheritanceChain: ['IfcWindow', 'IfcBuildingElement', 'IfcElement', 'IfcProduct', 'IfcObject', 'IfcRoot'],
      name: `Window ${i}`,
      spatial: {},
      properties: {},
      quantities: {},
      classifications: [],
      relationships: {},
    });

    if (!mockByType.has('IFCWINDOW')) mockByType.set('IFCWINDOW', new Set());
    mockByType.get('IFCWINDOW')!.add(expressId);
  }

  const mockIndex = {
    elements: mockElements,
    byType: mockByType,
    byStorey: new Map(),
    byClassification: new Map(),
    byMaterial: new Map(),
    propertySets: new Set(['Pset_WallCommon', 'Pset_DoorCommon', 'Pset_SlabCommon']),
    classificationSystems: new Set(['Uniclass 2015']),
    get: (id: number) => mockElements.get(id),
    getByType: (type: string) => {
      const ids = mockByType.get(type);
      if (!ids) return [];
      return Array.from(ids).map(id => mockElements.get(id)).filter(Boolean);
    },
    [Symbol.iterator]: function* () {
      for (const element of mockElements.values()) {
        yield element;
      }
    },
  } as unknown as ElementIndex;

  return {
    index: mockIndex,
    schema: mockSchema,
    stats: {
      parseTime: 450,
      extractionTime: 320,
      totalElements: 1247,
      propertySets: 3,
      materials: 6,
      classifications: 1,
    },
  };
}
