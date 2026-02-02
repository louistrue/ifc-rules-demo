/**
 * Element Indexer - Builds a unified, denormalized index of IFC elements
 *
 * This module takes the raw parsed output from ifc-lite and creates
 * a queryable index with all related data (properties, materials,
 * spatial info, classifications) attached to each element.
 */

import type {
  UnifiedElement,
  ElementIndex,
  PropertyValue,
  ElementMaterial,
  ElementClassification,
  SpatialLocation,
  ElementRelationships,
} from './types';

// Type definitions for ifc-lite parser output
// These match the structures returned by ifc-lite extractors

interface ParsedEntity {
  expressId: number;
  type: string;
  attributes: unknown[];
}

interface ParseResult {
  entities: Map<number, ParsedEntity>;
  entitiesByType: Map<string, Set<number>>;
}

interface PropertySetData {
  name: string;
  properties: Map<string, { type: string; value: unknown }>;
}

interface MaterialsData {
  materials: Map<number, { name: string; description?: string }>;
  materialLayers: Map<number, { name?: string; thickness: number; material?: string }>;
  materialLayerSets: Map<number, { name?: string; layers: number[]; totalThickness: number }>;
  associations: Array<{ elementId: number; materialId: number; type: string }>;
}

interface ClassificationsData {
  classifications: Map<number, { name: string; source?: string }>;
  classificationReferences: Map<number, {
    identification: string;
    name?: string;
    referencedSource?: number;
  }>;
  elementClassifications: Map<number, number[]>;
}

interface SpatialHierarchy {
  byStorey: Map<number, Set<number>>;
  byBuilding: Map<number, Set<number>>;
  bySite: Map<number, Set<number>>;
  bySpace: Map<number, Set<number>>;
  storeyElevations: Map<number, number>;
  elementToStorey: Map<number, number>;
  project?: { expressId: number; name?: string };
}

interface RelationshipData {
  type: string;
  relatingObject: number;
  relatedObjects: number[];
}

// IFC entity type hierarchy for inheritance chain lookup
const IFC_INHERITANCE: Record<string, string[]> = {
  IfcWall: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcWall'],
  IfcWallStandardCase: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcWall', 'IfcWallStandardCase'],
  IfcDoor: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcDoor'],
  IfcWindow: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcWindow'],
  IfcSlab: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcSlab'],
  IfcColumn: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcColumn'],
  IfcBeam: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcBeam'],
  IfcRoof: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcRoof'],
  IfcStair: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcStair'],
  IfcRailing: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcRailing'],
  IfcCurtainWall: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcElement', 'IfcBuildingElement', 'IfcCurtainWall'],
  IfcSpace: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSpace'],
  IfcBuildingStorey: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcBuildingStorey'],
  IfcBuilding: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcBuilding'],
  IfcSite: ['IfcRoot', 'IfcObjectDefinition', 'IfcObject', 'IfcProduct', 'IfcSpatialElement', 'IfcSpatialStructureElement', 'IfcSite'],
  IfcProject: ['IfcRoot', 'IfcObjectDefinition', 'IfcContext', 'IfcProject'],
  // Add more as needed - in production, use ifc-lite's SCHEMA_REGISTRY
};

function getInheritanceChain(type: string): string[] {
  return IFC_INHERITANCE[type] || [type];
}

/**
 * Build a unified element index from ifc-lite parsed data
 */
export async function buildElementIndex(
  parseResult: ParseResult,
  options: {
    propertySets?: Map<number, PropertySetData>;
    materials?: MaterialsData;
    classifications?: ClassificationsData;
    spatialHierarchy?: SpatialHierarchy;
    relationships?: RelationshipData[];
    entityNames?: Map<number, string>;
  } = {}
): Promise<ElementIndex> {
  const elements = new Map<number, UnifiedElement>();
  const byType = new Map<string, Set<number>>();
  const byStorey = new Map<string, Set<number>>();
  const byClassification = new Map<string, Set<number>>();
  const byMaterial = new Map<string, Set<number>>();
  const propertySetsFound = new Set<string>();
  const classificationSystems = new Set<string>();

  // Build reverse lookup maps from relationships
  const propertyRelations = new Map<number, number[]>(); // element -> propertyset IDs
  const typeRelations = new Map<number, number>(); // element -> type ID

  if (options.relationships) {
    for (const rel of options.relationships) {
      if (rel.type === 'IFCRELDEFINESBYPROPERTIES') {
        for (const elementId of rel.relatedObjects) {
          const existing = propertyRelations.get(elementId) || [];
          existing.push(rel.relatingObject);
          propertyRelations.set(elementId, existing);
        }
      } else if (rel.type === 'IFCRELDEFINESBYTYPE') {
        for (const elementId of rel.relatedObjects) {
          typeRelations.set(elementId, rel.relatingObject);
        }
      }
    }
  }

  // Build element-to-spatial lookup
  const elementToSpatial = new Map<number, SpatialLocation>();

  if (options.spatialHierarchy) {
    const { byStorey: storeyMap, storeyElevations, elementToStorey } = options.spatialHierarchy;

    // Get storey names
    const storeyNames = new Map<number, string>();
    for (const [storeyId] of storeyMap) {
      const storeyEntity = parseResult.entities.get(storeyId);
      if (storeyEntity) {
        const name = storeyEntity.attributes[2] as string;
        storeyNames.set(storeyId, name || `Storey ${storeyId}`);
      }
    }

    // Map elements to their spatial location
    for (const [elementId, storeyId] of elementToStorey) {
      const storeyName = storeyNames.get(storeyId);
      const elevation = storeyElevations.get(storeyId);
      elementToSpatial.set(elementId, {
        storey: storeyName,
        storeyElevation: elevation,
        // Building, site, project would come from traversing the hierarchy
      });
    }
  }

  // Process each entity
  for (const [expressId, entity] of parseResult.entities) {
    // Skip non-product entities (relationships, property sets, etc.)
    const inheritanceChain = getInheritanceChain(entity.type);
    const isProduct = inheritanceChain.includes('IfcProduct') ||
                      inheritanceChain.includes('IfcSpatialStructureElement');

    if (!isProduct && !entity.type.startsWith('Ifc')) continue;

    // Extract basic attributes
    // IFC attribute order: GlobalId, OwnerHistory, Name, Description, ObjectType, ...
    const globalId = entity.attributes[0] as string || '';
    const name = entity.attributes[2] as string;
    const description = entity.attributes[3] as string;
    const objectType = entity.attributes[4] as string;

    // Get properties for this element
    const properties: Record<string, Record<string, PropertyValue>> = {};
    const propertySetIds = propertyRelations.get(expressId) || [];

    if (options.propertySets) {
      for (const psetId of propertySetIds) {
        const pset = options.propertySets.get(psetId);
        if (pset) {
          propertySetsFound.add(pset.name);
          properties[pset.name] = {};
          for (const [propName, propValue] of pset.properties) {
            properties[pset.name][propName] = {
              type: propValue.type as PropertyValue['type'],
              value: propValue.value as PropertyValue['value'],
            };
          }
        }
      }
    }

    // Get material for this element
    let material: ElementMaterial | undefined;
    if (options.materials) {
      const assoc = options.materials.associations.find(a => a.elementId === expressId);
      if (assoc) {
        if (assoc.type === 'layer_set') {
          const layerSet = options.materials.materialLayerSets.get(assoc.materialId);
          if (layerSet) {
            material = {
              name: layerSet.name || 'Unnamed Layer Set',
              type: 'layerSet',
              totalThickness: layerSet.totalThickness,
              layers: layerSet.layers.map(layerId => {
                const layer = options.materials!.materialLayers.get(layerId);
                return {
                  material: layer?.material || 'Unknown',
                  thickness: layer?.thickness || 0,
                };
              }),
            };
          }
        } else {
          const mat = options.materials.materials.get(assoc.materialId);
          if (mat) {
            material = {
              name: mat.name,
              type: 'single',
            };
          }
        }

        if (material) {
          const matKey = material.name.toLowerCase();
          if (!byMaterial.has(matKey)) {
            byMaterial.set(matKey, new Set());
          }
          byMaterial.get(matKey)!.add(expressId);
        }
      }
    }

    // Get classifications for this element
    const classifications: ElementClassification[] = [];
    if (options.classifications) {
      const classIds = options.classifications.elementClassifications.get(expressId) || [];
      for (const classId of classIds) {
        const ref = options.classifications.classificationReferences.get(classId);
        if (ref) {
          const sourceId = ref.referencedSource;
          const source = sourceId ? options.classifications.classifications.get(sourceId) : undefined;
          const systemName = source?.name || 'Unknown System';

          classificationSystems.add(systemName);

          const classification: ElementClassification = {
            system: systemName,
            code: ref.identification,
            name: ref.name || ref.identification,
            path: [], // Would be built by traversing classification hierarchy
          };
          classifications.push(classification);

          // Index by classification code
          const classKey = `${systemName}:${ref.identification}`;
          if (!byClassification.has(classKey)) {
            byClassification.set(classKey, new Set());
          }
          byClassification.get(classKey)!.add(expressId);
        }
      }
    }

    // Get spatial location
    const spatial = elementToSpatial.get(expressId) || {};

    // Get relationships
    const relationships: ElementRelationships = {};
    if (typeRelations.has(expressId)) {
      relationships.hasType = typeRelations.get(expressId);
    }

    // Create unified element
    const element: UnifiedElement = {
      expressId,
      globalId,
      type: entity.type,
      inheritanceChain,
      name,
      description,
      objectType,
      spatial,
      properties,
      quantities: {}, // Would be populated from quantity extractor
      material,
      classifications,
      relationships,
    };

    elements.set(expressId, element);

    // Index by type
    if (!byType.has(entity.type)) {
      byType.set(entity.type, new Set());
    }
    byType.get(entity.type)!.add(expressId);

    // Index by storey
    if (spatial.storey) {
      if (!byStorey.has(spatial.storey)) {
        byStorey.set(spatial.storey, new Set());
      }
      byStorey.get(spatial.storey)!.add(expressId);
    }
  }

  // Create the index object
  const index: ElementIndex = {
    elements,
    byType,
    byStorey,
    byClassification,
    byMaterial,
    propertySets: propertySetsFound,
    classificationSystems,

    get(expressId: number): UnifiedElement | undefined {
      return elements.get(expressId);
    },

    getByType(type: string, includeSubtypes = true): UnifiedElement[] {
      const result: UnifiedElement[] = [];

      if (includeSubtypes) {
        // Find all types that have this type in their inheritance chain
        for (const [typeName, ids] of byType) {
          const chain = getInheritanceChain(typeName);
          if (chain.includes(type)) {
            for (const id of ids) {
              const el = elements.get(id);
              if (el) result.push(el);
            }
          }
        }
      } else {
        const ids = byType.get(type);
        if (ids) {
          for (const id of ids) {
            const el = elements.get(id);
            if (el) result.push(el);
          }
        }
      }

      return result;
    },

    [Symbol.iterator](): Iterator<UnifiedElement> {
      return elements.values();
    },
  };

  return index;
}

/**
 * Helper to extract property sets from parsed entities
 */
export function extractPropertySetsMap(
  entities: Map<number, ParsedEntity>,
  entitiesByType: Map<string, Set<number>>
): Map<number, PropertySetData> {
  const propertySets = new Map<number, PropertySetData>();

  const psetIds = entitiesByType.get('IFCPROPERTYSET') || new Set();

  for (const psetId of psetIds) {
    const pset = entities.get(psetId);
    if (!pset) continue;

    const name = pset.attributes[2] as string || 'Unnamed';
    const propertyRefs = pset.attributes[4] as number[] || [];

    const properties = new Map<string, { type: string; value: unknown }>();

    for (const propRef of propertyRefs) {
      const propEntity = entities.get(propRef);
      if (!propEntity) continue;

      const propName = propEntity.attributes[0] as string;
      const propValue = propEntity.attributes[2]; // NominalValue position varies

      let type: string = 'string';
      let value: unknown = propValue;

      if (propValue === null || propValue === undefined) {
        type = 'null';
        value = null;
      } else if (typeof propValue === 'number') {
        type = 'number';
      } else if (typeof propValue === 'boolean') {
        type = 'boolean';
      } else if (typeof propValue === 'string') {
        // Check for IFC boolean strings
        if (propValue === '.T.') {
          type = 'boolean';
          value = true;
        } else if (propValue === '.F.') {
          type = 'boolean';
          value = false;
        } else {
          type = 'string';
        }
      }

      properties.set(propName, { type, value });
    }

    propertySets.set(psetId, { name, properties });
  }

  return propertySets;
}
