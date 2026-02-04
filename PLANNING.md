# Rule-Based IFC Selection - Planning

## Problem

Selecting IFC elements by GlobalId/GUID is fragile:
- GUIDs change between model versions
- No semantic meaning
- Rules break when models update

## Solution

Select elements using **semantic criteria** instead - entity type, properties, spatial location, materials, classifications, etc.

This demo uses ifc-lite, but the concept applies to any IFC parser. The rule engine just needs elements in a unified format - how you extract that data is up to you.

## Architecture

Three layers:

1. **Parser** - Extract data from IFC (using whatever library you prefer)
2. **Index** - Denormalized elements with properties, materials, spatial info attached
3. **Rule Engine** - Evaluate JSON rules against elements, return matching Express IDs

## Unified Element Format

```typescript
interface UnifiedElement {
  expressId: number;
  globalId: string;
  type: string;                    // "IfcWall", "IfcDoor", etc.
  name?: string;
  description?: string;

  spatial: {
    building?: string;
    storey?: string;
    space?: string;
    storeyElevation?: number;
  };

  properties: Record<string, Record<string, any>>;
  // e.g., { "Pset_WallCommon": { "IsExternal": true } }

  quantities: Record<string, Record<string, number>>;

  material?: {
    name: string;
    layers?: Array<{ material: string; thickness: number }>;
  };

  classifications: Array<{
    system: string;
    code: string;
    name: string;
  }>;
}
```

## Rule Format

```typescript
interface SelectionRule {
  id: string;
  name: string;
  description?: string;
  conditions: Condition[];
}
```

Conditions can be:
- `entityType` - Match by IFC type
- `property` - Match by property value
- `spatial` - Match by location (storey, building, space)
- `material` - Match by material name
- `classification` - Match by classification code
- `attribute` - Match by name, description, etc.
- `quantity` - Match by quantity value
- `or` / `not` - Combine conditions

## Example Rules

External walls:
```json
{
  "id": "external-walls",
  "name": "External Walls",
  "conditions": [
    { "type": "entityType", "entityType": "IfcWall" },
    { "type": "property", "propertySet": "Pset_WallCommon",
      "propertyName": "IsExternal", "operator": "equals", "value": true }
  ]
}
```

Fire-rated doors:
```json
{
  "id": "fire-doors",
  "name": "Fire-Rated Doors (30+ min)",
  "conditions": [
    { "type": "entityType", "entityType": "IfcDoor" },
    { "type": "property", "propertySet": "Pset_DoorCommon",
      "propertyName": "FireRating", "operator": "greaterOrEqual", "value": 30 }
  ]
}
```

Ground floor structural:
```json
{
  "id": "ground-floor-structural",
  "name": "Ground Floor Structural Elements",
  "conditions": [
    { "type": "entityType", "entityType": ["IfcWall", "IfcColumn", "IfcBeam", "IfcSlab"] },
    { "type": "property", "propertySet": "*", "propertyName": "LoadBearing",
      "operator": "equals", "value": true },
    { "type": "spatial", "level": "storey", "name": "*Ground*" }
  ]
}
```

## Implementation

### Core
- `element-indexer.ts` - Build unified element index from parser output
- `rule-evaluator.ts` - Evaluate rules against elements
- `types.ts` - TypeScript interfaces

### Builders
- `fluent-builder.ts` - Chainable API for building rules

### Operators
- String: equals, contains, matches, startsWith, endsWith
- Numeric: equals, greaterThan, lessThan, between
- Existence: exists, notExists

## Benefits

| Aspect | GUID-Based | Rule-Based |
|--------|-----------|------------|
| Model Updates | Breaks | Resilient |
| Cross-Model | Different GUIDs | Same rules work |
| Maintainability | Opaque | Self-documenting |
| Flexibility | One element | Pattern-based bulk |
| Reusability | None | Save and share rules |
