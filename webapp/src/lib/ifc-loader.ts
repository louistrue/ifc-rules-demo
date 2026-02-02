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
  const fileSize = buffer.byteLength;

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
    RelationshipExtractor,
  } = await import('@ifc-lite/parser');

  const propertyExtractor = new PropertyExtractor(parseResult.entities);
  const propertySets = await propertyExtractor.extractPropertySetsAsync();

  report('properties', 78, `Found ${propertySets.size} property sets`);

  // ==========================================================================
  // Phase 3: Extract relationships
  // ==========================================================================

  report('properties', 80, 'Building relationships...');

  const relationshipExtractor = new RelationshipExtractor(parseResult.entities);
  const relationships = await relationshipExtractor.extractAsync();

  // ==========================================================================
  // Phase 4: Extract materials
  // ==========================================================================

  report('materials', 85, 'Extracting materials...');

  const { extractMaterials } = await import('@ifc-lite/parser');
  const materials = extractMaterials(parseResult.entities, parseResult.entitiesByType);

  report('materials', 88, `Found ${materials.materials.size} materials`);

  // ==========================================================================
  // Phase 5: Extract classifications
  // ==========================================================================

  report('classifications', 90, 'Extracting classifications...');

  const { extractClassifications } = await import('@ifc-lite/parser');
  const classifications = extractClassifications(parseResult.entities, parseResult.entitiesByType);

  report('classifications', 93, `Found ${classifications.classifications.size} systems`);

  // ==========================================================================
  // Phase 6: Build spatial hierarchy
  // ==========================================================================

  report('indexing', 95, 'Building spatial hierarchy...');

  const { SpatialHierarchyBuilder } = await import('@ifc-lite/parser');
  const spatialBuilder = new SpatialHierarchyBuilder(parseResult.entities, relationships);
  const spatialHierarchy = spatialBuilder.build();

  // ==========================================================================
  // Phase 7: Build unified index
  // ==========================================================================

  report('indexing', 97, 'Building element index...');

  const { buildElementIndex } = await import('../../../src/core/element-indexer');
  const index = await buildElementIndex(parseResult, {
    propertySets,
    materials,
    classifications,
    spatialHierarchy,
    relationships,
  });

  // ==========================================================================
  // Phase 8: Extract schema for autocomplete
  // ==========================================================================

  report('indexing', 99, 'Preparing autocomplete data...');

  const { extractIfcSchema } = await import('./schema-extractor');
  const schema = extractIfcSchema(index);

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
  buffer: ArrayBuffer,
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

  // Create mock index (minimal for demo)
  const mockIndex = {
    elements: new Map(),
    byType: new Map(),
    byStorey: new Map(),
    byClassification: new Map(),
    byMaterial: new Map(),
    propertySets: new Set(['Pset_WallCommon', 'Pset_DoorCommon', 'Pset_SlabCommon']),
    classificationSystems: new Set(['Uniclass 2015']),
    get: () => undefined,
    getByType: () => [],
    [Symbol.iterator]: function* () {},
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
