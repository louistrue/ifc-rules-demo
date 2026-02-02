/**
 * Schema Extractor - Discovers what data exists in a loaded IFC file
 *
 * This module analyzes the parsed IFC data and builds a "schema" of what's
 * available for rule building - entity types, property sets, storeys, etc.
 *
 * The extracted schema powers the autocomplete and validation in the rule builder UI.
 */

import type { ElementIndex, UnifiedElement } from '../../../src/core/types';

// ============================================================================
// Schema Types - What exists in the loaded file
// ============================================================================

export interface EntityTypeInfo {
  type: string;
  count: number;
  hasSubtypes: boolean;
  subtypes?: EntityTypeInfo[];
}

export interface PropertyInfo {
  name: string;
  valueType: 'string' | 'number' | 'boolean' | 'null' | 'mixed';
  values: Array<{ value: unknown; count: number }>;
  frequency: number; // How many elements have this property
}

export interface PropertySetInfo {
  name: string;
  appliesTo: string[]; // Entity types that have this pset
  elementCount: number;
  properties: PropertyInfo[];
}

export interface StoreyInfo {
  name: string;
  elevation: number;
  elementCount: number;
}

export interface BuildingInfo {
  name: string;
  storeys: StoreyInfo[];
  elementCount: number;
}

export interface MaterialInfo {
  name: string;
  type: 'single' | 'layerSet' | 'profileSet' | 'constituentSet';
  elementCount: number;
  thickness?: { min: number; max: number };
}

export interface ClassificationCodeInfo {
  code: string;
  name: string;
  elementCount: number;
  children?: ClassificationCodeInfo[];
}

export interface ClassificationSystemInfo {
  system: string;
  codes: ClassificationCodeInfo[];
  elementCount: number;
}

export interface QuantityInfo {
  name: string;
  unit?: string;
  range: { min: number; max: number };
  frequency: number;
}

export interface QuantitySetInfo {
  name: string;
  appliesTo: string[];
  quantities: QuantityInfo[];
}

/**
 * Complete schema of what exists in the loaded IFC file
 */
export interface IfcFileSchema {
  // Summary
  totalElements: number;
  fileName?: string;

  // Entity types present
  entityTypes: EntityTypeInfo[];

  // Property sets and their properties
  propertySets: PropertySetInfo[];

  // Spatial structure
  spatial: {
    projects: string[];
    sites: string[];
    buildings: BuildingInfo[];
    storeys: StoreyInfo[];
    spaces: Array<{ name: string; storey?: string; area?: number }>;
  };

  // Materials in model
  materials: MaterialInfo[];

  // Classification systems
  classifications: ClassificationSystemInfo[];

  // Quantity sets
  quantitySets: QuantitySetInfo[];

  // Quick lookups
  lookup: {
    typesByCount: Array<{ type: string; count: number }>;
    propertiesByFrequency: Array<{ pset: string; prop: string; frequency: number }>;
    storeysByElevation: Array<{ name: string; elevation: number }>;
  };
}

// ============================================================================
// Schema Extraction
// ============================================================================

/**
 * Extract schema from element index - discovers what's in the file
 */
export function extractIfcSchema(index: ElementIndex): IfcFileSchema {
  const elements = Array.from(index);

  // Count entity types
  const typeCounts = new Map<string, number>();
  for (const el of elements) {
    typeCounts.set(el.type, (typeCounts.get(el.type) || 0) + 1);
  }

  // Build entity type info with hierarchy
  const entityTypes: EntityTypeInfo[] = [];
  const typeHierarchy = new Map<string, Set<string>>(); // parent -> subtypes

  for (const el of elements) {
    const chain = el.inheritanceChain;
    for (let i = 0; i < chain.length - 1; i++) {
      const parent = chain[i];
      const child = chain[i + 1];
      if (!typeHierarchy.has(parent)) {
        typeHierarchy.set(parent, new Set());
      }
      typeHierarchy.get(parent)!.add(child);
    }
  }

  // Build entity types list
  for (const [type, count] of typeCounts) {
    const subtypes = typeHierarchy.get(type);
    entityTypes.push({
      type,
      count,
      hasSubtypes: subtypes !== undefined && subtypes.size > 0,
    });
  }

  // Sort by count descending
  entityTypes.sort((a, b) => b.count - a.count);

  // Extract property sets
  const psetMap = new Map<string, {
    appliesTo: Set<string>;
    elements: Set<number>;
    properties: Map<string, {
      valueType: Set<string>;
      values: Map<string, number>;
      count: number;
    }>;
  }>();

  for (const el of elements) {
    for (const [psetName, props] of Object.entries(el.properties)) {
      if (!psetMap.has(psetName)) {
        psetMap.set(psetName, {
          appliesTo: new Set(),
          elements: new Set(),
          properties: new Map(),
        });
      }

      const psetInfo = psetMap.get(psetName)!;
      psetInfo.appliesTo.add(el.type);
      psetInfo.elements.add(el.expressId);

      for (const [propName, propValue] of Object.entries(props)) {
        if (!psetInfo.properties.has(propName)) {
          psetInfo.properties.set(propName, {
            valueType: new Set(),
            values: new Map(),
            count: 0,
          });
        }

        const propInfo = psetInfo.properties.get(propName)!;
        propInfo.count++;
        propInfo.valueType.add(propValue.type);

        const valueKey = JSON.stringify(propValue.value);
        propInfo.values.set(valueKey, (propInfo.values.get(valueKey) || 0) + 1);
      }
    }
  }

  // Convert to PropertySetInfo
  const propertySets: PropertySetInfo[] = [];
  for (const [psetName, info] of psetMap) {
    const properties: PropertyInfo[] = [];

    for (const [propName, propInfo] of info.properties) {
      // Determine value type
      let valueType: PropertyInfo['valueType'] = 'mixed';
      if (propInfo.valueType.size === 1) {
        valueType = propInfo.valueType.values().next().value as PropertyInfo['valueType'];
      }

      // Get top values
      const values: Array<{ value: unknown; count: number }> = [];
      for (const [valueKey, count] of propInfo.values) {
        values.push({ value: JSON.parse(valueKey), count });
      }
      values.sort((a, b) => b.count - a.count);

      properties.push({
        name: propName,
        valueType,
        values: values.slice(0, 10), // Top 10 values
        frequency: propInfo.count,
      });
    }

    // Sort properties by frequency
    properties.sort((a, b) => b.frequency - a.frequency);

    propertySets.push({
      name: psetName,
      appliesTo: Array.from(info.appliesTo),
      elementCount: info.elements.size,
      properties,
    });
  }

  // Sort psets by element count
  propertySets.sort((a, b) => b.elementCount - a.elementCount);

  // Extract spatial structure
  const storeyMap = new Map<string, { elevation: number; count: number }>();
  const buildingMap = new Map<string, Set<string>>();
  const spaceList: Array<{ name: string; storey?: string; area?: number }> = [];

  for (const el of elements) {
    if (el.spatial.storey) {
      const existing = storeyMap.get(el.spatial.storey);
      if (existing) {
        existing.count++;
      } else {
        storeyMap.set(el.spatial.storey, {
          elevation: el.spatial.storeyElevation || 0,
          count: 1,
        });
      }
    }

    if (el.spatial.building) {
      if (!buildingMap.has(el.spatial.building)) {
        buildingMap.set(el.spatial.building, new Set());
      }
      if (el.spatial.storey) {
        buildingMap.get(el.spatial.building)!.add(el.spatial.storey);
      }
    }

    // Collect spaces
    if (el.type === 'IfcSpace') {
      spaceList.push({
        name: el.name || 'Unnamed Space',
        storey: el.spatial.storey,
        area: el.quantities['Qto_SpaceBaseQuantities']?.['NetFloorArea'],
      });
    }
  }

  const storeys: StoreyInfo[] = Array.from(storeyMap.entries())
    .map(([name, info]) => ({
      name,
      elevation: info.elevation,
      elementCount: info.count,
    }))
    .sort((a, b) => a.elevation - b.elevation);

  const buildings: BuildingInfo[] = Array.from(buildingMap.entries())
    .map(([name, storeyNames]) => ({
      name,
      storeys: Array.from(storeyNames)
        .map(s => storeys.find(st => st.name === s)!)
        .filter(Boolean),
      elementCount: Array.from(storeyNames)
        .reduce((sum, s) => sum + (storeyMap.get(s)?.count || 0), 0),
    }));

  // Extract materials
  const materialMap = new Map<string, {
    type: MaterialInfo['type'];
    count: number;
    thicknesses: number[];
  }>();

  for (const el of elements) {
    if (el.material) {
      const key = el.material.name;
      if (!materialMap.has(key)) {
        materialMap.set(key, {
          type: el.material.type,
          count: 0,
          thicknesses: [],
        });
      }
      const info = materialMap.get(key)!;
      info.count++;
      if (el.material.totalThickness) {
        info.thicknesses.push(el.material.totalThickness);
      }
    }
  }

  const materials: MaterialInfo[] = Array.from(materialMap.entries())
    .map(([name, info]) => ({
      name,
      type: info.type,
      elementCount: info.count,
      thickness: info.thicknesses.length > 0 ? {
        min: Math.min(...info.thicknesses),
        max: Math.max(...info.thicknesses),
      } : undefined,
    }))
    .sort((a, b) => b.elementCount - a.elementCount);

  // Extract classifications
  const classSystemMap = new Map<string, Map<string, {
    name: string;
    count: number;
  }>>();

  for (const el of elements) {
    for (const cls of el.classifications) {
      if (!classSystemMap.has(cls.system)) {
        classSystemMap.set(cls.system, new Map());
      }
      const codeMap = classSystemMap.get(cls.system)!;
      if (!codeMap.has(cls.code)) {
        codeMap.set(cls.code, { name: cls.name, count: 0 });
      }
      codeMap.get(cls.code)!.count++;
    }
  }

  const classifications: ClassificationSystemInfo[] = Array.from(classSystemMap.entries())
    .map(([system, codeMap]) => ({
      system,
      codes: Array.from(codeMap.entries())
        .map(([code, info]) => ({
          code,
          name: info.name,
          elementCount: info.count,
        }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      elementCount: Array.from(codeMap.values()).reduce((sum, c) => sum + c.count, 0),
    }))
    .sort((a, b) => b.elementCount - a.elementCount);

  // Extract quantity sets
  const qsetMap = new Map<string, {
    appliesTo: Set<string>;
    quantities: Map<string, { values: number[]; unit?: string }>;
  }>();

  for (const el of elements) {
    for (const [qsetName, quantities] of Object.entries(el.quantities)) {
      if (!qsetMap.has(qsetName)) {
        qsetMap.set(qsetName, { appliesTo: new Set(), quantities: new Map() });
      }
      const qsetInfo = qsetMap.get(qsetName)!;
      qsetInfo.appliesTo.add(el.type);

      for (const [qtyName, value] of Object.entries(quantities)) {
        if (!qsetInfo.quantities.has(qtyName)) {
          qsetInfo.quantities.set(qtyName, { values: [] });
        }
        qsetInfo.quantities.get(qtyName)!.values.push(value);
      }
    }
  }

  const quantitySets: QuantitySetInfo[] = Array.from(qsetMap.entries())
    .map(([name, info]) => ({
      name,
      appliesTo: Array.from(info.appliesTo),
      quantities: Array.from(info.quantities.entries())
        .map(([qtyName, qtyInfo]) => ({
          name: qtyName,
          range: {
            min: Math.min(...qtyInfo.values),
            max: Math.max(...qtyInfo.values),
          },
          frequency: qtyInfo.values.length,
        })),
    }));

  // Build quick lookups
  const typesByCount = entityTypes.map(t => ({ type: t.type, count: t.count }));

  const propertiesByFrequency: Array<{ pset: string; prop: string; frequency: number }> = [];
  for (const pset of propertySets) {
    for (const prop of pset.properties) {
      propertiesByFrequency.push({
        pset: pset.name,
        prop: prop.name,
        frequency: prop.frequency,
      });
    }
  }
  propertiesByFrequency.sort((a, b) => b.frequency - a.frequency);

  const storeysByElevation = storeys.map(s => ({
    name: s.name,
    elevation: s.elevation,
  }));

  return {
    totalElements: elements.length,
    entityTypes,
    propertySets,
    spatial: {
      projects: [], // Would come from spatial hierarchy
      sites: [],
      buildings,
      storeys,
      spaces: spaceList,
    },
    materials,
    classifications,
    quantitySets,
    lookup: {
      typesByCount,
      propertiesByFrequency,
      storeysByElevation,
    },
  };
}

// ============================================================================
// Helper functions for UI
// ============================================================================

/**
 * Get property sets that apply to a specific entity type
 */
export function getPropertySetsForType(
  schema: IfcFileSchema,
  entityType: string | string[]
): PropertySetInfo[] {
  const types = Array.isArray(entityType) ? entityType : [entityType];

  return schema.propertySets.filter(pset =>
    pset.appliesTo.some(t => types.includes(t))
  );
}

/**
 * Get properties for a property set
 */
export function getPropertiesForPset(
  schema: IfcFileSchema,
  psetName: string
): PropertyInfo[] {
  const pset = schema.propertySets.find(p => p.name === psetName);
  return pset?.properties || [];
}

/**
 * Get sample values for a property (for autocomplete)
 */
export function getSampleValues(
  schema: IfcFileSchema,
  psetName: string,
  propName: string
): Array<{ value: unknown; count: number }> {
  const pset = schema.propertySets.find(p => p.name === psetName);
  const prop = pset?.properties.find(p => p.name === propName);
  return prop?.values || [];
}

/**
 * Search for properties across all property sets
 */
export function searchProperties(
  schema: IfcFileSchema,
  query: string
): Array<{ pset: string; prop: PropertyInfo }> {
  const results: Array<{ pset: string; prop: PropertyInfo }> = [];
  const lowerQuery = query.toLowerCase();

  for (const pset of schema.propertySets) {
    for (const prop of pset.properties) {
      if (prop.name.toLowerCase().includes(lowerQuery)) {
        results.push({ pset: pset.name, prop });
      }
    }
  }

  return results.sort((a, b) => b.prop.frequency - a.prop.frequency);
}

/**
 * Get suggested conditions based on selected entity type
 */
export function getSuggestedConditions(
  schema: IfcFileSchema,
  entityType: string
): Array<{ pset: string; prop: string; description: string }> {
  const suggestions: Array<{ pset: string; prop: string; description: string }> = [];

  // Common property suggestions by type
  const commonProps: Record<string, Array<{ pset: string; prop: string; desc: string }>> = {
    IfcWall: [
      { pset: 'Pset_WallCommon', prop: 'IsExternal', desc: 'External walls' },
      { pset: 'Pset_WallCommon', prop: 'LoadBearing', desc: 'Structural walls' },
      { pset: 'Pset_WallCommon', prop: 'FireRating', desc: 'Fire-rated walls' },
    ],
    IfcDoor: [
      { pset: 'Pset_DoorCommon', prop: 'FireRating', desc: 'Fire-rated doors' },
      { pset: 'Pset_DoorCommon', prop: 'IsExternal', desc: 'External doors' },
    ],
    IfcWindow: [
      { pset: 'Pset_WindowCommon', prop: 'IsExternal', desc: 'External windows' },
    ],
    IfcSlab: [
      { pset: 'Pset_SlabCommon', prop: 'IsExternal', desc: 'External slabs' },
    ],
    IfcSpace: [
      { pset: 'Pset_SpaceCommon', prop: 'Category', desc: 'Space category' },
    ],
  };

  const typeProps = commonProps[entityType] || [];

  for (const { pset, prop, desc } of typeProps) {
    // Check if this property actually exists in the model
    const psetInfo = schema.propertySets.find(p => p.name === pset);
    const propInfo = psetInfo?.properties.find(p => p.name === prop);

    if (propInfo) {
      suggestions.push({ pset, prop, description: desc });
    }
  }

  return suggestions;
}
