/**
 * Basic Usage Example - IFC Rule-Based Selection
 *
 * This example demonstrates how to use the rule engine with ifc-lite
 * to select IFC elements using semantic criteria instead of GUIDs.
 */

import { IfcParser } from '@ifc-lite/parser';
import {
  buildElementIndex,
  createRuleEngine,
  RuleBuilder,
  type SelectionRule,
} from '../src';

async function main() {
  // ============================================================================
  // 1. Parse IFC File with ifc-lite
  // ============================================================================

  console.log('Parsing IFC file...');

  const parser = new IfcParser();

  // Load your IFC file (replace with actual path or fetch)
  const ifcBuffer = await fetch('/path/to/model.ifc').then(r => r.arrayBuffer());

  const parseResult = await parser.parse(ifcBuffer, {
    onProgress: ({ phase, percent }) => {
      console.log(`  ${phase}: ${percent.toFixed(0)}%`);
    }
  });

  console.log(`Parsed ${parseResult.entityCount} entities\n`);

  // ============================================================================
  // 2. Build Element Index
  // ============================================================================

  console.log('Building element index...');

  // In production, you would also extract and pass:
  // - propertySets from PropertyExtractor
  // - materials from extractMaterials()
  // - classifications from extractClassifications()
  // - spatialHierarchy from SpatialHierarchyBuilder
  // - relationships from RelationshipExtractor

  const index = await buildElementIndex(parseResult, {
    // propertySets: extractedPropertySets,
    // materials: extractedMaterials,
    // classifications: extractedClassifications,
    // spatialHierarchy: builtSpatialHierarchy,
    // relationships: extractedRelationships,
  });

  console.log(`Indexed ${index.elements.size} elements`);
  console.log(`  Types: ${index.byType.size}`);
  console.log(`  Storeys: ${index.byStorey.size}`);
  console.log(`  Property Sets: ${index.propertySets.size}\n`);

  // ============================================================================
  // 3. Create Rule Engine
  // ============================================================================

  const engine = createRuleEngine(index);

  // ============================================================================
  // 4. Example: Select with JSON Rule
  // ============================================================================

  console.log('--- JSON Rule Example ---');

  const externalWallsRule: SelectionRule = {
    id: 'external-walls',
    name: 'External Walls',
    conditions: [
      { type: 'entityType', entityType: 'IfcWall' },
      {
        type: 'property',
        propertySet: 'Pset_WallCommon',
        propertyName: 'IsExternal',
        operator: 'equals',
        value: true,
      },
    ],
  };

  const externalWalls = engine.select(externalWallsRule);

  console.log(`Found ${externalWalls.count} external walls`);
  console.log(`Evaluation time: ${externalWalls.evaluationTime.toFixed(2)}ms\n`);

  // ============================================================================
  // 5. Example: Select with Fluent Builder
  // ============================================================================

  console.log('--- Fluent Builder Examples ---');

  // Example 5a: Load-bearing walls on ground floor
  const groundFloorStructural = engine.query(
    RuleBuilder
      .select('IfcWall')
      .where('Pset_WallCommon.LoadBearing').equals(true)
      .onStorey('*Ground*')
      .build()
      .conditions
  );

  console.log(`Ground floor load-bearing walls: ${groundFloorStructural.count}`);

  // Example 5b: Fire-rated doors
  const fireRatedDoors = engine.query(
    RuleBuilder
      .select('IfcDoor')
      .where('Pset_DoorCommon.FireRating').greaterThan(0)
      .build()
      .conditions
  );

  console.log(`Fire-rated doors: ${fireRatedDoors.count}`);

  // Example 5c: Concrete elements
  const concreteElements = engine.query(
    RuleBuilder
      .select(['IfcWall', 'IfcColumn', 'IfcBeam', 'IfcSlab'])
      .withMaterial('*Concrete*')
      .build()
      .conditions
  );

  console.log(`Concrete structural elements: ${concreteElements.count}`);

  // Example 5d: Elements by classification
  const structuralByClass = engine.query(
    RuleBuilder
      .select('*')
      .withClassification('Uniclass 2015', 'Ss_*')  // Structural systems
      .build()
      .conditions
  );

  console.log(`Elements with Uniclass structural code: ${structuralByClass.count}`);

  // Example 5e: Large spaces
  const largeSpaces = engine.query(
    RuleBuilder
      .select('IfcSpace')
      .withQuantity('NetFloorArea').greaterThan(50)
      .build()
      .conditions
  );

  console.log(`Spaces over 50m²: ${largeSpaces.count}`);

  // Example 5f: Elements matching name pattern
  const facadeElements = engine.query(
    RuleBuilder
      .select('*')
      .whereName().matches('^(EXT|FACADE|CW)-.*')
      .build()
      .conditions
  );

  console.log(`Facade elements (by name): ${facadeElements.count}\n`);

  // ============================================================================
  // 6. Group Results
  // ============================================================================

  console.log('--- Grouping Results ---');

  const allWalls = engine.query({ type: 'entityType', entityType: 'IfcWall' });

  // Group by storey
  const wallsByStorey = allWalls.groupBy('spatial.storey');
  console.log('Walls by storey:');
  for (const [storey, ids] of wallsByStorey) {
    console.log(`  ${storey}: ${ids.length} walls`);
  }

  // Group by type
  const wallsByType = allWalls.groupBy('type');
  console.log('Walls by type:');
  for (const [type, ids] of wallsByType) {
    console.log(`  ${type}: ${ids.length}`);
  }

  // ============================================================================
  // 7. Access Selected Elements
  // ============================================================================

  console.log('\n--- Accessing Elements ---');

  // Get the actual element objects
  const elements = externalWalls.getElements();

  for (const element of elements.slice(0, 3)) {
    console.log(`\nElement: ${element.name || 'Unnamed'}`);
    console.log(`  Type: ${element.type}`);
    console.log(`  ExpressId: ${element.expressId}`);
    console.log(`  Storey: ${element.spatial.storey || 'Unknown'}`);

    if (element.material) {
      console.log(`  Material: ${element.material.name}`);
    }

    if (element.classifications.length > 0) {
      console.log(`  Classifications:`);
      for (const cls of element.classifications) {
        console.log(`    - ${cls.system}: ${cls.code} (${cls.name})`);
      }
    }
  }

  // ============================================================================
  // 8. Rule Validation
  // ============================================================================

  console.log('\n--- Rule Validation ---');

  const suspiciousRule: SelectionRule = {
    id: 'test',
    name: 'Test Rule',
    conditions: [
      {
        type: 'property',
        propertySet: 'NonExistentPset',
        propertyName: 'SomeProperty',
        operator: 'equals',
        value: true,
      },
    ],
  };

  const validation = engine.validate(suspiciousRule);

  console.log(`Rule valid: ${validation.valid}`);
  console.log(`Errors: ${validation.errors.length}`);
  console.log(`Warnings: ${validation.warnings.length}`);

  for (const warning of validation.warnings) {
    console.log(`  Warning: ${warning.message}`);
    if (warning.suggestion) {
      console.log(`    Suggestion: ${warning.suggestion}`);
    }
  }

  // ============================================================================
  // 9. Use with Viewer (conceptual)
  // ============================================================================

  console.log('\n--- Integration with Viewer ---');
  console.log('// Highlight selected elements in your viewer:');
  console.log('// viewer.highlightElements(externalWalls.expressIds);');
  console.log('// viewer.isolate(groundFloorStructural.expressIds);');
  console.log('// viewer.setColor(fireRatedDoors.expressIds, 0xff0000);');
}

// Run the example
main().catch(console.error);
