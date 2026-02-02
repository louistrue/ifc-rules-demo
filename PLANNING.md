# Rule-Based IFC Selection Demo - Planning Document

## Problem Statement

When working with IFC files, accessing entities by their GlobalId/GUID causes problems:
- **GUIDs change** between model versions/uploads
- **No semantic meaning** - GUIDs are opaque identifiers
- **Brittle integrations** - rules tied to GUIDs break when models update

## Solution: Rule-Based Selection

Instead of selecting by GUID, select elements using **semantic criteria**:
- Entity type (IfcWall, IfcDoor, IfcSlab...)
- Properties (from PropertySets)
- Spatial location (storey, building, space)
- Classifications (Uniclass, Omniclass, custom)
- Materials (name, layers, thickness)
- Attributes (name, description, objectType)
- Relationships (contained in, part of, connected to)

---

## ifc-lite Capabilities Summary

### Data Available via ifc-lite

| Data Type | Extractor | Access Pattern |
|-----------|-----------|----------------|
| **Entities** | `IfcParser` | `result.entities` - all entities with type |
| **Properties** | `PropertyExtractor` | Property sets with typed values |
| **Quantities** | `QuantityExtractor` | Area, volume, length, etc. |
| **Spatial** | `SpatialHierarchyBuilder` | Project → Site → Building → Storey → Space |
| **Materials** | `extractMaterials()` | Materials, layers, profiles, associations |
| **Classifications** | `extractClassifications()` | Uniclass, Omniclass codes with paths |
| **Relationships** | `RelationshipExtractor` | Containment, aggregation, associations |
| **Georeferencing** | `extractGeoreferencing()` | World coordinates, CRS info |
| **Schema Metadata** | `SCHEMA_REGISTRY` | Inheritance chains, all attributes |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         IFC File                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ifc-lite Parser                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Entities │ │Properties│ │ Spatial  │ │ Materials/Class. │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Element Index                         │
│  - Denormalized view of each element                            │
│  - All properties, materials, spatial info attached             │
│  - Indexed for fast querying                                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Rule Engine                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐   │
│  │ Rule Parser │ │ Evaluator   │ │ Result Aggregator       │   │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Selected Elements                           │
│  - Express IDs of matching elements                             │
│  - Can be used for highlighting, export, validation             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Unified Element Interface

```typescript
interface UnifiedElement {
  // Core identity (NOT relying on GlobalId for selection)
  expressId: number;
  globalId: string;  // Available but not used for rule matching

  // Type information
  type: string;                    // "IfcWall", "IfcDoor", etc.
  predefinedType?: string;         // "STANDARD", "MOVABLE", etc.
  objectType?: string;             // User-defined type
  inheritanceChain: string[];      // ["IfcRoot", "IfcObject", ...]

  // Basic attributes
  name?: string;
  description?: string;
  tag?: string;

  // Spatial location
  spatial: {
    project?: string;
    site?: string;
    building?: string;
    storey?: string;
    space?: string;
    storeyElevation?: number;
  };

  // Properties (from PropertySets)
  properties: Record<string, Record<string, PropertyValue>>;
  // e.g., { "Pset_WallCommon": { "IsExternal": true, "LoadBearing": true } }

  // Quantities
  quantities: Record<string, Record<string, number>>;
  // e.g., { "Qto_WallBaseQuantities": { "GrossVolume": 12.5, "NetArea": 25.0 } }

  // Materials
  material?: {
    name: string;
    type: 'single' | 'layerSet' | 'profileSet' | 'constituentSet';
    layers?: Array<{ material: string; thickness: number }>;
  };

  // Classifications
  classifications: Array<{
    system: string;      // "Uniclass 2015", "Omniclass"
    code: string;        // "Pr_60_10_32"
    name: string;        // "External walls"
    path: string[];      // Full hierarchy path
  }>;

  // Relationships
  relationships: {
    containedIn?: number;      // Parent spatial element
    aggregatedBy?: number;     // Part-of relationship
    connectedTo?: number[];    // Connected elements
    hasOpenings?: number[];    // Openings in this element
    fillsOpening?: number;     // If this fills an opening
  };

  // Geometry bounds (for spatial queries)
  bounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

interface PropertyValue {
  type: 'string' | 'number' | 'boolean' | 'null';
  value: string | number | boolean | null;
  unit?: string;
}
```

---

## Rule Definition Language

### JSON-Based Rules (Developer Friendly)

```typescript
interface SelectionRule {
  id: string;
  name: string;
  description?: string;

  // Conditions (all must match - AND logic)
  conditions: Condition[];

  // Optional: combine multiple rule sets
  mode?: 'all' | 'any';  // default: 'all'
}

type Condition =
  | TypeCondition
  | PropertyCondition
  | SpatialCondition
  | MaterialCondition
  | ClassificationCondition
  | AttributeCondition
  | QuantityCondition
  | RelationshipCondition
  | CompositeCondition;

// Type-based selection
interface TypeCondition {
  type: 'entityType';
  entityType: string | string[];  // "IfcWall" or ["IfcWall", "IfcCurtainWall"]
  includeSubtypes?: boolean;      // default: true
  predefinedType?: string;        // "STANDARD", "MOVABLE"
}

// Property-based selection
interface PropertyCondition {
  type: 'property';
  propertySet: string;            // "Pset_WallCommon" or "*" for any
  propertyName: string;
  operator: ComparisonOperator;
  value: string | number | boolean | null;
}

// Spatial selection
interface SpatialCondition {
  type: 'spatial';
  level: 'project' | 'site' | 'building' | 'storey' | 'space';
  name?: string;                  // Match by name (supports wildcards)
  elevation?: {
    operator: NumericOperator;
    value: number;
  };
}

// Material selection
interface MaterialCondition {
  type: 'material';
  name?: string;                  // Material name (supports wildcards)
  minThickness?: number;          // For layer sets
  maxThickness?: number;
}

// Classification selection
interface ClassificationCondition {
  type: 'classification';
  system?: string;                // "Uniclass 2015" or "*"
  code?: string;                  // Exact or prefix match: "Pr_60*"
  name?: string;                  // Classification name (wildcards)
}

// Attribute selection
interface AttributeCondition {
  type: 'attribute';
  attribute: 'name' | 'description' | 'tag' | 'objectType';
  operator: StringOperator;
  value: string;
}

// Quantity selection
interface QuantityCondition {
  type: 'quantity';
  quantitySet?: string;           // "Qto_WallBaseQuantities" or "*"
  quantityName: string;           // "GrossVolume", "NetArea"
  operator: NumericOperator;
  value: number;
}

// Relationship selection
interface RelationshipCondition {
  type: 'relationship';
  relation: 'containedIn' | 'aggregatedBy' | 'connectedTo' | 'hasType';
  target?: {
    type?: string;
    name?: string;
  };
}

// Combine conditions with OR logic
interface CompositeCondition {
  type: 'or';
  conditions: Condition[];
}

type ComparisonOperator =
  | 'equals' | 'notEquals'
  | 'contains' | 'startsWith' | 'endsWith' | 'matches'
  | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual'
  | 'between' | 'exists' | 'notExists';

type NumericOperator =
  | 'equals' | 'notEquals'
  | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual'
  | 'between';

type StringOperator =
  | 'equals' | 'notEquals'
  | 'contains' | 'startsWith' | 'endsWith' | 'matches';
```

---

## Example Rules

### 1. All External Walls

```json
{
  "id": "external-walls",
  "name": "All External Walls",
  "conditions": [
    { "type": "entityType", "entityType": "IfcWall" },
    {
      "type": "property",
      "propertySet": "Pset_WallCommon",
      "propertyName": "IsExternal",
      "operator": "equals",
      "value": true
    }
  ]
}
```

### 2. Load-Bearing Elements on Ground Floor

```json
{
  "id": "ground-floor-structural",
  "name": "Ground Floor Structural Elements",
  "conditions": [
    {
      "type": "entityType",
      "entityType": ["IfcWall", "IfcColumn", "IfcBeam", "IfcSlab"]
    },
    {
      "type": "property",
      "propertySet": "*",
      "propertyName": "LoadBearing",
      "operator": "equals",
      "value": true
    },
    {
      "type": "spatial",
      "level": "storey",
      "name": "*Ground*"
    }
  ]
}
```

### 3. Fire-Rated Doors

```json
{
  "id": "fire-rated-doors",
  "name": "Fire-Rated Doors (30+ min)",
  "conditions": [
    { "type": "entityType", "entityType": "IfcDoor" },
    {
      "type": "property",
      "propertySet": "Pset_DoorCommon",
      "propertyName": "FireRating",
      "operator": "greaterOrEqual",
      "value": 30
    }
  ]
}
```

### 4. Concrete Elements by Classification

```json
{
  "id": "concrete-structural",
  "name": "Concrete Structural Elements (Uniclass)",
  "conditions": [
    {
      "type": "classification",
      "system": "Uniclass 2015",
      "code": "Ss_25*"
    },
    {
      "type": "material",
      "name": "*Concrete*"
    }
  ]
}
```

### 5. Large Rooms (by Quantity)

```json
{
  "id": "large-rooms",
  "name": "Spaces Over 50m²",
  "conditions": [
    { "type": "entityType", "entityType": "IfcSpace" },
    {
      "type": "quantity",
      "quantityName": "NetFloorArea",
      "operator": "greaterThan",
      "value": 50
    }
  ]
}
```

### 6. Elements Named Like Pattern

```json
{
  "id": "facade-elements",
  "name": "Facade Elements by Name",
  "conditions": [
    {
      "type": "attribute",
      "attribute": "name",
      "operator": "matches",
      "value": "^(EXT|FACADE|CW)-.*"
    }
  ]
}
```

### 7. Complex OR Condition

```json
{
  "id": "MEP-equipment",
  "name": "All MEP Equipment",
  "conditions": [
    {
      "type": "or",
      "conditions": [
        { "type": "entityType", "entityType": "IfcFlowTerminal" },
        { "type": "entityType", "entityType": "IfcEnergyConversionDevice" },
        {
          "type": "classification",
          "system": "*",
          "code": "Ss_55*"
        }
      ]
    }
  ]
}
```

---

## User-Friendly Query Builder

### Natural Language-Like API

```typescript
// Fluent API for building rules
const rule = RuleBuilder
  .select('IfcWall')
  .where('Pset_WallCommon.IsExternal').equals(true)
  .and('Pset_WallCommon.LoadBearing').equals(true)
  .onStorey('Ground Floor')
  .withMaterial('*Concrete*')
  .build();

// Or with spatial queries
const groundFloorWalls = RuleBuilder
  .select(['IfcWall', 'IfcCurtainWall'])
  .onStorey({ elevation: { min: 0, max: 4 } })
  .build();

// Classification-based
const structuralElements = RuleBuilder
  .select('*')  // Any element
  .withClassification('Uniclass 2015', 'Ss_*')  // Structural systems
  .build();
```

### Visual Query Builder (React Component)

```tsx
<RuleBuilder
  onRuleChange={(rule) => setActiveRule(rule)}
  schema={ifcSchema}
  availablePropertySets={propertySetsInModel}
  availableClassifications={classificationsInModel}
/>
```

---

## Implementation Plan

### Phase 1: Core Engine

1. **Element Indexer** - Parse IFC and build unified element index
2. **Rule Parser** - Validate and parse JSON rules
3. **Rule Evaluator** - Match elements against conditions
4. **Result Set** - Efficient storage of matched element IDs

### Phase 2: Developer Experience

1. **TypeScript Types** - Full type safety for rules
2. **Fluent Builder API** - Chainable rule construction
3. **Validation** - Schema validation for rules
4. **Error Messages** - Helpful error messages for invalid rules

### Phase 3: User Experience

1. **Visual Rule Builder** - React component for building rules
2. **Rule Templates** - Pre-built rules for common use cases
3. **Rule Preview** - Show matched elements count before applying
4. **Rule History** - Save and load rule configurations

### Phase 4: Integration

1. **Viewer Integration** - Highlight matched elements
2. **Export** - Export matched elements to various formats
3. **Validation Rules** - Use rules for model validation/checking
4. **API** - REST/GraphQL API for rule evaluation

---

## File Structure

```
ifc-rules-demo/
├── src/
│   ├── core/
│   │   ├── element-indexer.ts      # Build unified element index
│   │   ├── rule-parser.ts          # Parse and validate rules
│   │   ├── rule-evaluator.ts       # Evaluate rules against elements
│   │   └── types.ts                # TypeScript interfaces
│   │
│   ├── extractors/
│   │   ├── property-resolver.ts    # Resolve property values
│   │   ├── spatial-resolver.ts     # Resolve spatial containment
│   │   ├── material-resolver.ts    # Resolve material info
│   │   └── classification-resolver.ts
│   │
│   ├── builders/
│   │   ├── fluent-builder.ts       # Fluent API for rules
│   │   └── rule-templates.ts       # Pre-built rule templates
│   │
│   ├── operators/
│   │   ├── string-operators.ts     # equals, contains, matches
│   │   ├── numeric-operators.ts    # >, <, between
│   │   └── wildcard-matcher.ts     # Glob-style matching
│   │
│   └── index.ts                    # Main exports
│
├── examples/
│   ├── basic-usage.ts
│   ├── complex-rules.ts
│   └── with-viewer.tsx
│
├── rules/
│   ├── structural.json             # Pre-built structural rules
│   ├── fire-safety.json            # Fire safety rules
│   └── mep.json                    # MEP selection rules
│
└── test/
    ├── rule-evaluator.test.ts
    └── fixtures/
        └── sample-model.ifc
```

---

## Quick Start Code

```typescript
import { IfcParser } from '@ifc-lite/parser';
import {
  buildElementIndex,
  createRuleEngine,
  RuleBuilder
} from '@ifc-rules/core';

// 1. Parse IFC file
const parser = new IfcParser();
const result = await parser.parse(ifcBuffer);

// 2. Build unified element index
const index = await buildElementIndex(result);

// 3. Create rule engine
const engine = createRuleEngine(index);

// 4. Define and execute rules
const externalWalls = engine.select({
  conditions: [
    { type: 'entityType', entityType: 'IfcWall' },
    { type: 'property', propertySet: 'Pset_WallCommon',
      propertyName: 'IsExternal', operator: 'equals', value: true }
  ]
});

console.log(`Found ${externalWalls.length} external walls`);

// 5. Use fluent builder
const groundFloorDoors = engine.query(
  RuleBuilder
    .select('IfcDoor')
    .onStorey('*Ground*')
    .where('Pset_DoorCommon.FireRating').greaterThan(0)
);

// 6. Highlight in viewer (if using React template)
viewer.highlightElements(groundFloorDoors);
```

---

## Benefits Over GUID-Based Selection

| Aspect | GUID-Based | Rule-Based |
|--------|-----------|------------|
| **Model Updates** | Breaks when model changes | Resilient - matches by criteria |
| **Cross-Model** | Different GUIDs per model | Same rules work across models |
| **Maintainability** | Opaque, hard to debug | Self-documenting, clear intent |
| **Flexibility** | One element at a time | Pattern-based bulk selection |
| **Reusability** | None | Rules can be saved and shared |
| **Validation** | Manual checking | Automated rule validation |

---

## Next Steps

1. Run `npx create-ifc-lite my-ifc-app --template react` to scaffold project
2. Implement core element indexer
3. Build rule parser and evaluator
4. Create fluent builder API
5. Add visual rule builder component
6. Test with sample IFC models
