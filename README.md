# IFC Rules - Rule-Based Element Selection

Select IFC elements using **semantic criteria** instead of brittle GUIDs.

## The Problem

Traditional IFC element selection relies on GlobalId (GUID):

```typescript
// Brittle - breaks when model updates
const element = model.getByGuid('2O2Fr$t4X7Zf8NOew3FLOH');
```

**Problems:**
- GUIDs change between model versions
- No semantic meaning - opaque identifiers
- Can't reuse selection logic across models
- Rules tied to GUIDs break when models update

## The Solution

Select by **what elements are**, not their arbitrary IDs:

```typescript
// Resilient - works across model versions
const externalWalls = engine.select({
  conditions: [
    { type: 'entityType', entityType: 'IfcWall' },
    { type: 'property', propertySet: 'Pset_WallCommon',
      propertyName: 'IsExternal', operator: 'equals', value: true }
  ]
});
```

## Quick Start

```bash
npm install @ifc-rules/core @ifc-lite/parser
```

```typescript
import { IfcParser } from '@ifc-lite/parser';
import { buildElementIndex, createRuleEngine, RuleBuilder } from '@ifc-rules/core';

// 1. Parse IFC file
const parser = new IfcParser();
const result = await parser.parse(ifcBuffer);

// 2. Build element index
const index = await buildElementIndex(result);

// 3. Create rule engine
const engine = createRuleEngine(index);

// 4. Select elements with JSON rules
const fireRatedDoors = engine.select({
  id: 'fire-doors',
  name: 'Fire-Rated Doors',
  conditions: [
    { type: 'entityType', entityType: 'IfcDoor' },
    { type: 'property', propertySet: 'Pset_DoorCommon',
      propertyName: 'FireRating', operator: 'greaterOrEqual', value: 30 }
  ]
});

console.log(`Found ${fireRatedDoors.count} fire-rated doors`);

// 5. Or use fluent builder
const concreteWalls = engine.query(
  RuleBuilder
    .select('IfcWall')
    .where('Pset_WallCommon.LoadBearing').equals(true)
    .withMaterial('*Concrete*')
    .onStorey('Ground Floor')
    .build()
    .conditions
);
```

## Selection Criteria

### By Entity Type

```typescript
// Single type
{ type: 'entityType', entityType: 'IfcWall' }

// Multiple types
{ type: 'entityType', entityType: ['IfcWall', 'IfcCurtainWall'] }

// With subtype inclusion
{ type: 'entityType', entityType: 'IfcBuildingElement', includeSubtypes: true }

// With predefined type
{ type: 'entityType', entityType: 'IfcSlab', predefinedType: 'FLOOR' }
```

### By Property

```typescript
// Boolean property
{ type: 'property', propertySet: 'Pset_WallCommon',
  propertyName: 'IsExternal', operator: 'equals', value: true }

// Numeric comparison
{ type: 'property', propertySet: 'Pset_DoorCommon',
  propertyName: 'FireRating', operator: 'greaterOrEqual', value: 30 }

// String matching (supports wildcards)
{ type: 'property', propertySet: 'Custom_Properties',
  propertyName: 'Status', operator: 'equals', value: 'Approved' }

// Search all property sets
{ type: 'property', propertySet: '*',
  propertyName: 'LoadBearing', operator: 'equals', value: true }

// Check existence
{ type: 'property', propertySet: 'Pset_WallCommon',
  propertyName: 'FireRating', operator: 'exists' }
```

### By Spatial Location

```typescript
// By storey name (supports wildcards)
{ type: 'spatial', level: 'storey', name: '*Ground*' }

// By storey elevation
{ type: 'spatial', level: 'storey',
  elevation: { operator: 'between', value: 0, valueTo: 4 } }

// By building
{ type: 'spatial', level: 'building', name: 'Building A' }

// By space
{ type: 'spatial', level: 'space', name: '*Corridor*' }
```

### By Material

```typescript
// By material name (supports wildcards)
{ type: 'material', name: '*Concrete*' }

// By thickness
{ type: 'material', minThickness: 0.2, maxThickness: 0.5 }
```

### By Classification

```typescript
// By system and code
{ type: 'classification', system: 'Uniclass 2015', code: 'Ss_25*' }

// Any system, specific code pattern
{ type: 'classification', system: '*', code: 'Pr_60*' }
```

### By Attribute

```typescript
// By name pattern
{ type: 'attribute', attribute: 'name', operator: 'matches', value: '^EXT-.*' }

// By description
{ type: 'attribute', attribute: 'description', operator: 'contains', value: 'structural' }
```

### By Quantity

```typescript
// By quantity value
{ type: 'quantity', quantityName: 'NetFloorArea', operator: 'greaterThan', value: 50 }

// From specific quantity set
{ type: 'quantity', quantitySet: 'Qto_WallBaseQuantities',
  quantityName: 'GrossVolume', operator: 'lessThan', value: 10 }
```

### Combining Conditions

```typescript
// OR conditions
{
  type: 'or',
  conditions: [
    { type: 'entityType', entityType: 'IfcFlowTerminal' },
    { type: 'entityType', entityType: 'IfcLightFixture' }
  ]
}

// NOT conditions
{
  type: 'not',
  conditions: [
    { type: 'property', propertySet: '*', propertyName: 'IsExternal',
      operator: 'equals', value: true }
  ]
}
```

## Fluent Builder API

For a more readable, chainable syntax:

```typescript
// Basic selection
RuleBuilder
  .select('IfcWall')
  .where('Pset_WallCommon.IsExternal').equals(true)
  .build();

// Multiple conditions
RuleBuilder
  .select('IfcDoor')
  .where('Pset_DoorCommon.FireRating').greaterOrEqual(30)
  .onStorey('*Ground*')
  .withMaterial('*Steel*')
  .build();

// Multiple types
RuleBuilder
  .select(['IfcWall', 'IfcColumn', 'IfcBeam'])
  .where('LoadBearing').equals(true)
  .withClassification('Uniclass 2015', 'Ss_*')
  .build();

// By name pattern
RuleBuilder
  .select('*')
  .whereName().matches('^(EXT|FACADE)-.*')
  .build();

// OR conditions
RuleBuilder
  .select('IfcDoor')
  .or(or => or
    .property('Pset_DoorCommon', 'FireRating', 30)
    .property('Pset_DoorCommon', 'FireRating', 60)
  )
  .build();
```

## Working with Results

```typescript
const result = engine.select(rule);

// Basic info
console.log(result.count);           // Number of matches
console.log(result.expressIds);      // Array of Express IDs
console.log(result.evaluationTime);  // Time in ms

// Get element objects
const elements = result.getElements();
for (const el of elements) {
  console.log(el.name, el.type, el.spatial.storey);
}

// Group by property
const byStorey = result.groupBy('spatial.storey');
for (const [storey, ids] of byStorey) {
  console.log(`${storey}: ${ids.length} elements`);
}
```

## Pre-Built Rules

The package includes common rule sets in `/rules`:

- `structural.json` - Walls, columns, beams, slabs
- `fire-safety.json` - Fire-rated doors, walls, alarms
- `spatial.json` - By floor, elevation, space type

```typescript
import structuralRules from '@ifc-rules/core/rules/structural.json';

for (const rule of structuralRules.rules) {
  const result = engine.select(rule);
  console.log(`${rule.name}: ${result.count}`);
}
```

## Rule Validation

Validate rules before execution:

```typescript
const validation = engine.validate(rule);

console.log(validation.valid);    // true/false
console.log(validation.errors);   // Critical issues
console.log(validation.warnings); // Suggestions (e.g., missing property sets)
```

## Integration with Viewers

```typescript
// Highlight selected elements
viewer.highlightElements(result.expressIds);

// Isolate selection
viewer.isolate(result.expressIds);

// Color by rule
viewer.setColor(result.expressIds, 0xff0000);
```

## Benefits

| Aspect | GUID-Based | Rule-Based |
|--------|-----------|------------|
| **Model Updates** | Breaks | Resilient |
| **Cross-Model** | Different GUIDs | Same rules work |
| **Maintainability** | Opaque | Self-documenting |
| **Flexibility** | One element | Pattern-based bulk |
| **Reusability** | None | Save and share rules |

## License

MPL-2.0
