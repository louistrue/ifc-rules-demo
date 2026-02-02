/**
 * On-Demand Property Extractor
 *
 * Extracts properties, materials, classifications from parsed IFC data
 * using ifc-lite's WASM-based on-demand extraction.
 *
 * Strategy:
 * - For small/mid models (<50MB): Extract all after geometry loads
 * - Properties/quantities are loaded via WASM on-demand
 * - Build schema for autocomplete once extraction completes
 */

import { useIfcStore } from '../stores/ifc-store';
import { extractIfcSchema, type IfcFileSchema } from './schema-extractor';
import { buildElementIndex, extractPropertySetsMap } from '../../../src/core/element-indexer';
import type { ElementIndex } from '../../../src/core/types';

type ProgressCallback = (phase: string, percent: number, message: string) => void;

/**
 * Extract all data from parsed IFC result
 * Call this after geometry has loaded for responsive UX
 */
export async function extractAllData(
  parseResult: unknown,
  onProgress?: ProgressCallback
): Promise<{ index: ElementIndex; schema: IfcFileSchema }> {
  const report = (phase: string, percent: number, message: string) => {
    onProgress?.(phase, percent, message);
    useIfcStore.getState().setExtractionProgress({
      phase: phase as 'properties' | 'materials' | 'classifications' | 'indexing',
      percent,
      message
    });
  };

  // Type assertion for ifc-lite parse result
  const result = parseResult as {
    entities: Map<number, { expressId: number; type: string; attributes: unknown[] }>;
    entitiesByType: Map<string, Set<number>>;
    entityCount: number;
  };

  report('properties', 0, 'Extracting properties...');

  // Extract property sets
  // ifc-lite loads these on-demand via WASM when accessed
  const propertySets = extractPropertySetsMap(result.entities, result.entitiesByType);
  report('properties', 30, `Found ${propertySets.size} property sets`);

  // Extract relationships
  report('properties', 40, 'Building relationships...');
  const relationships = extractRelationships(result.entities, result.entitiesByType);
  report('properties', 50, `Found ${relationships.length} relationships`);

  // Extract materials
  report('materials', 60, 'Extracting materials...');
  const materials = extractMaterials(result.entities, result.entitiesByType);
  report('materials', 70, `Found ${materials.materials.size} materials`);

  // Extract classifications
  report('classifications', 75, 'Extracting classifications...');
  const classifications = extractClassifications(result.entities, result.entitiesByType);
  report('classifications', 80, `Found ${classifications.classifications.size} systems`);

  // Build spatial hierarchy
  report('indexing', 85, 'Building spatial hierarchy...');
  const spatialHierarchy = buildSpatialHierarchy(result.entities, result.entitiesByType, relationships);
  report('indexing', 90, 'Spatial hierarchy complete');

  // Build unified element index
  report('indexing', 92, 'Building element index...');
  const index = await buildElementIndex(
    { entities: result.entities, entitiesByType: result.entitiesByType } as Parameters<typeof buildElementIndex>[0],
    {
      propertySets,
      materials,
      classifications,
      spatialHierarchy,
      relationships,
    }
  );
  report('indexing', 96, `Indexed ${index.elements.size} elements`);

  // Build schema for autocomplete
  report('indexing', 98, 'Preparing autocomplete...');
  const schema = extractIfcSchema(index);

  report('complete', 100, 'Ready');

  return { index, schema };
}

/**
 * Extract relationships from entities
 */
function extractRelationships(
  entities: Map<number, { expressId: number; type: string; attributes: unknown[] }>,
  entitiesByType: Map<string, Set<number>>
): Array<{ type: string; relatingObject: number; relatedObjects: number[] }> {
  const relationships: Array<{ type: string; relatingObject: number; relatedObjects: number[] }> = [];

  const relTypes = [
    'IFCRELCONTAINEDINSPATIALSTRUCTURE',
    'IFCRELAGGREGATES',
    'IFCRELDEFINESBYPROPERTIES',
    'IFCRELDEFINESBYTYPE',
    'IFCRELASSOCIATESMATERIAL',
    'IFCRELVOIDSELEMENT',
    'IFCRELFILLSELEMENT',
  ];

  for (const relType of relTypes) {
    const ids = entitiesByType.get(relType);
    if (!ids) continue;

    for (const id of ids) {
      const entity = entities.get(id);
      if (!entity) continue;

      // IFC relationship attribute positions vary by type
      // Most have RelatingXxx at position 4 and RelatedXxx at position 5
      let relatingIdx = 4;
      let relatedIdx = 5;

      // IFCRELDEFINESBYPROPERTIES has them swapped
      if (relType === 'IFCRELDEFINESBYPROPERTIES') {
        relatingIdx = 5;
        relatedIdx = 4;
      }

      const relating = entity.attributes[relatingIdx];
      const related = entity.attributes[relatedIdx];

      if (typeof relating === 'number' && Array.isArray(related)) {
        relationships.push({
          type: relType,
          relatingObject: relating,
          relatedObjects: related.filter((r): r is number => typeof r === 'number'),
        });
      }
    }
  }

  return relationships;
}

/**
 * Extract materials from entities
 */
function extractMaterials(
  entities: Map<number, { expressId: number; type: string; attributes: unknown[] }>,
  entitiesByType: Map<string, Set<number>>
) {
  const materials = new Map<number, { name: string; description?: string }>();
  const materialLayers = new Map<number, { name?: string; thickness: number; material?: string }>();
  const materialLayerSets = new Map<number, { name?: string; layers: number[]; totalThickness: number }>();
  const associations: Array<{ elementId: number; materialId: number; type: string }> = [];

  // Extract IfcMaterial
  const materialIds = entitiesByType.get('IFCMATERIAL');
  if (materialIds) {
    for (const id of materialIds) {
      const entity = entities.get(id);
      if (entity) {
        materials.set(id, {
          name: entity.attributes[0] as string || 'Unnamed Material',
          description: entity.attributes[1] as string,
        });
      }
    }
  }

  // Extract IfcMaterialLayer
  const layerIds = entitiesByType.get('IFCMATERIALLAYER');
  if (layerIds) {
    for (const id of layerIds) {
      const entity = entities.get(id);
      if (entity) {
        const matRef = entity.attributes[0] as number;
        const mat = materials.get(matRef);
        materialLayers.set(id, {
          material: mat?.name,
          thickness: entity.attributes[1] as number || 0,
          name: entity.attributes[2] as string,
        });
      }
    }
  }

  // Extract IfcMaterialLayerSet
  const layerSetIds = entitiesByType.get('IFCMATERIALLAYERSET');
  if (layerSetIds) {
    for (const id of layerSetIds) {
      const entity = entities.get(id);
      if (entity) {
        const layers = entity.attributes[0] as number[] || [];
        const totalThickness = layers.reduce((sum, layerId) => {
          const layer = materialLayers.get(layerId);
          return sum + (layer?.thickness || 0);
        }, 0);
        materialLayerSets.set(id, {
          layers,
          totalThickness,
          name: entity.attributes[1] as string,
        });
      }
    }
  }

  // Extract material associations
  const assocIds = entitiesByType.get('IFCRELASSOCIATESMATERIAL');
  if (assocIds) {
    for (const id of assocIds) {
      const entity = entities.get(id);
      if (entity) {
        const relatedObjects = entity.attributes[4] as number[] || [];
        const materialRef = entity.attributes[5] as number;

        // Determine material type
        const isMaterial = materials.has(materialRef);
        const isLayerSet = materialLayerSets.has(materialRef);

        for (const elementId of relatedObjects) {
          associations.push({
            elementId,
            materialId: materialRef,
            type: isLayerSet ? 'layer_set' : isMaterial ? 'single' : 'unknown',
          });
        }
      }
    }
  }

  return { materials, materialLayers, materialLayerSets, associations };
}

/**
 * Extract classifications from entities
 */
function extractClassifications(
  entities: Map<number, { expressId: number; type: string; attributes: unknown[] }>,
  entitiesByType: Map<string, Set<number>>
) {
  const classifications = new Map<number, { name: string; source?: string }>();
  const classificationReferences = new Map<number, { identification: string; name?: string; referencedSource?: number }>();
  const elementClassifications = new Map<number, number[]>();

  // Extract IfcClassification
  const classIds = entitiesByType.get('IFCCLASSIFICATION');
  if (classIds) {
    for (const id of classIds) {
      const entity = entities.get(id);
      if (entity) {
        classifications.set(id, {
          name: entity.attributes[2] as string || 'Unknown',
          source: entity.attributes[0] as string,
        });
      }
    }
  }

  // Extract IfcClassificationReference
  const refIds = entitiesByType.get('IFCCLASSIFICATIONREFERENCE');
  if (refIds) {
    for (const id of refIds) {
      const entity = entities.get(id);
      if (entity) {
        classificationReferences.set(id, {
          identification: entity.attributes[1] as string || '',
          name: entity.attributes[2] as string,
          referencedSource: entity.attributes[3] as number,
        });
      }
    }
  }

  // Extract classification associations
  const assocIds = entitiesByType.get('IFCRELASSOCIATESCLASSIFICATION');
  if (assocIds) {
    for (const id of assocIds) {
      const entity = entities.get(id);
      if (entity) {
        const relatedObjects = entity.attributes[4] as number[] || [];
        const classRef = entity.attributes[5] as number;

        for (const elementId of relatedObjects) {
          if (!elementClassifications.has(elementId)) {
            elementClassifications.set(elementId, []);
          }
          elementClassifications.get(elementId)!.push(classRef);
        }
      }
    }
  }

  return { classifications, classificationReferences, elementClassifications };
}

/**
 * Build spatial hierarchy from relationships
 */
function buildSpatialHierarchy(
  entities: Map<number, { expressId: number; type: string; attributes: unknown[] }>,
  entitiesByType: Map<string, Set<number>>,
  relationships: Array<{ type: string; relatingObject: number; relatedObjects: number[] }>
) {
  const byStorey = new Map<number, Set<number>>();
  const byBuilding = new Map<number, Set<number>>();
  const bySite = new Map<number, Set<number>>();
  const bySpace = new Map<number, Set<number>>();
  const storeyElevations = new Map<number, number>();
  const elementToStorey = new Map<number, number>();

  // Get storey elevations
  const storeyIds = entitiesByType.get('IFCBUILDINGSTOREY');
  if (storeyIds) {
    for (const id of storeyIds) {
      const entity = entities.get(id);
      if (entity) {
        // Elevation is typically at attribute index 9
        const elevation = entity.attributes[9] as number || 0;
        storeyElevations.set(id, elevation);
        byStorey.set(id, new Set());
      }
    }
  }

  // Process spatial containment relationships
  for (const rel of relationships) {
    if (rel.type === 'IFCRELCONTAINEDINSPATIALSTRUCTURE') {
      const containerEntity = entities.get(rel.relatingObject);
      if (!containerEntity) continue;

      const containerType = containerEntity.type.toUpperCase();

      if (containerType === 'IFCBUILDINGSTOREY') {
        if (!byStorey.has(rel.relatingObject)) {
          byStorey.set(rel.relatingObject, new Set());
        }
        for (const elementId of rel.relatedObjects) {
          byStorey.get(rel.relatingObject)!.add(elementId);
          elementToStorey.set(elementId, rel.relatingObject);
        }
      } else if (containerType === 'IFCBUILDING') {
        if (!byBuilding.has(rel.relatingObject)) {
          byBuilding.set(rel.relatingObject, new Set());
        }
        for (const elementId of rel.relatedObjects) {
          byBuilding.get(rel.relatingObject)!.add(elementId);
        }
      } else if (containerType === 'IFCSITE') {
        if (!bySite.has(rel.relatingObject)) {
          bySite.set(rel.relatingObject, new Set());
        }
        for (const elementId of rel.relatedObjects) {
          bySite.get(rel.relatingObject)!.add(elementId);
        }
      } else if (containerType === 'IFCSPACE') {
        if (!bySpace.has(rel.relatingObject)) {
          bySpace.set(rel.relatingObject, new Set());
        }
        for (const elementId of rel.relatedObjects) {
          bySpace.get(rel.relatingObject)!.add(elementId);
        }
      }
    }
  }

  return {
    byStorey,
    byBuilding,
    bySite,
    bySpace,
    storeyElevations,
    elementToStorey,
  };
}

/**
 * Hook to trigger extraction after parse completes
 */
export function useDataExtraction() {
  const parseResult = useIfcStore(state => state.parseResult);
  const isExtracting = useIfcStore(state => state.isExtracting);
  const schema = useIfcStore(state => state.schema);

  const startExtraction = async () => {
    if (!parseResult || isExtracting || schema) return;

    const store = useIfcStore.getState();
    store.setIsExtracting(true);

    try {
      const { index, schema } = await extractAllData(parseResult);
      store.setIndex(index);
      store.setSchema(schema);
      store.setIsExtracting(false);
    } catch (error) {
      console.error('Extraction failed:', error);
      store.setError(error instanceof Error ? error.message : 'Failed to extract data');
    }
  };

  return { startExtraction, isExtracting };
}
