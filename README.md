# IFC Rules - Rule-Based Element Selection

Select IFC elements using **semantic criteria** instead of brittle GUIDs.

This demo uses [ifc-lite](https://github.com/AECgeeks/ifc-lite), but the concept applies to any IFC parser - [web-ifc](https://github.com/ThatOpen/engine_web-ifc), [IFCOpenShell](https://ifcopenshell.org/), or your own.

## The Problem

Traditional IFC element selection relies on GlobalId (GUID):

```typescript
// Brittle - breaks when model updates
const element = model.getByGuid('2O2Fr$t4X7Zf8NOew3FLOH');
```

GUIDs change between model versions, have no semantic meaning, and can't be reused across models.

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

The parser doesn't matter - the same JSON rule format works regardless of how you read your IFC file.

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

// 4. Select elements
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
```

## Selection Criteria

### By Entity Type

```typescript
{ type: 'entityType', entityType: 'IfcWall' }
{ type: 'entityType', entityType: ['IfcWall', 'IfcCurtainWall'] }
{ type: 'entityType', entityType: 'IfcSlab', predefinedType: 'FLOOR' }
```

### By Property

```typescript
{ type: 'property', propertySet: 'Pset_WallCommon',
  propertyName: 'IsExternal', operator: 'equals', value: true }

{ type: 'property', propertySet: 'Pset_DoorCommon',
  propertyName: 'FireRating', operator: 'greaterOrEqual', value: 30 }

// Search all property sets
{ type: 'property', propertySet: '*',
  propertyName: 'LoadBearing', operator: 'equals', value: true }
```

### By Spatial Location

```typescript
{ type: 'spatial', level: 'storey', name: '*Ground*' }
{ type: 'spatial', level: 'building', name: 'Building A' }
```

### By Material

```typescript
{ type: 'material', name: '*Concrete*' }
```

### By Classification

```typescript
{ type: 'classification', system: 'Uniclass 2015', code: 'Ss_25*' }
```

### By Attribute

```typescript
{ type: 'attribute', attribute: 'name', operator: 'matches', value: '^EXT-.*' }
```

### By Quantity

```typescript
{ type: 'quantity', quantityName: 'NetFloorArea', operator: 'greaterThan', value: 50 }
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

For a more readable syntax:

```typescript
RuleBuilder
  .select('IfcWall')
  .where('Pset_WallCommon.IsExternal').equals(true)
  .build();

RuleBuilder
  .select('IfcDoor')
  .where('Pset_DoorCommon.FireRating').greaterOrEqual(30)
  .onStorey('*Ground*')
  .withMaterial('*Steel*')
  .build();

RuleBuilder
  .select(['IfcWall', 'IfcColumn', 'IfcBeam'])
  .where('LoadBearing').equals(true)
  .withClassification('Uniclass 2015', 'Ss_*')
  .build();
```

## Working with Results

```typescript
const result = engine.select(rule);

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
```

## Pre-Built Rules

The package includes common rule sets in `/rules`:

- `structural.json` - Walls, columns, beams, slabs
- `fire-safety.json` - Fire-rated doors, walls, alarms
- `spatial.json` - By floor, elevation, space type

## Integration with Viewers

```typescript
viewer.highlightElements(result.expressIds);
viewer.isolate(result.expressIds);
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
