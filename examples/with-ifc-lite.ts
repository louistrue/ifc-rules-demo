/**
 * Full Integration Example with ifc-lite
 *
 * This example shows the complete workflow of parsing an IFC file
 * with all ifc-lite extractors and building a fully-indexed model
 * for rule-based selection.
 */

import {
  IfcParser,
  PropertyExtractor,
  RelationshipExtractor,
  SpatialHierarchyBuilder,
  extractMaterials,
  extractClassifications,
} from '@ifc-lite/parser';

import {
  buildElementIndex,
  createRuleEngine,
  RuleBuilder,
  type SelectionRule,
  type ElementIndex,
} from '../src';

/**
 * Parse IFC file and build complete element index
 */
async function parseAndIndex(ifcBuffer: ArrayBuffer): Promise<ElementIndex> {
  console.log('=== Parsing IFC File ===\n');

  // 1. Parse the IFC file
  const parser = new IfcParser();
  const result = await parser.parse(ifcBuffer, {
    onProgress: ({ phase, percent }) => {
      process.stdout.write(`\r${phase}: ${percent.toFixed(0)}%`);
    }
  });
  console.log(`\n\nParsed ${result.entityCount} entities`);

  // 2. Extract relationships
  console.log('\nExtracting relationships...');
  const relationshipExtractor = new RelationshipExtractor(result.entities);
  const relationships = await relationshipExtractor.extractAsync();
  console.log(`  Found ${relationships.length} relationships`);

  // 3. Build spatial hierarchy
  console.log('Building spatial hierarchy...');
  const spatialBuilder = new SpatialHierarchyBuilder(result.entities, relationships);
  const spatialHierarchy = spatialBuilder.build();
  console.log(`  ${spatialHierarchy.byStorey.size} storeys`);
  console.log(`  ${spatialHierarchy.byBuilding.size} buildings`);

  // 4. Extract property sets
  console.log('Extracting properties...');
  const propertyExtractor = new PropertyExtractor(result.entities);
  const propertySets = await propertyExtractor.extractPropertySetsAsync();
  console.log(`  ${propertySets.size} property sets`);

  // 5. Extract materials
  console.log('Extracting materials...');
  const materials = extractMaterials(result.entities, result.entitiesByType);
  console.log(`  ${materials.materials.size} materials`);
  console.log(`  ${materials.materialLayerSets.size} layer sets`);

  // 6. Extract classifications
  console.log('Extracting classifications...');
  const classifications = extractClassifications(result.entities, result.entitiesByType);
  console.log(`  ${classifications.classifications.size} classification systems`);
  console.log(`  ${classifications.classificationReferences.size} references`);

  // 7. Build unified element index
  console.log('\nBuilding element index...');
  const index = await buildElementIndex(result, {
    propertySets,
    materials,
    classifications,
    spatialHierarchy,
    relationships,
  });

  console.log(`\n=== Index Complete ===`);
  console.log(`  Total elements: ${index.elements.size}`);
  console.log(`  Entity types: ${index.byType.size}`);
  console.log(`  Storeys indexed: ${index.byStorey.size}`);
  console.log(`  Property sets: ${index.propertySets.size}`);
  console.log(`  Classification systems: ${index.classificationSystems.size}`);

  return index;
}

/**
 * Demo: Model Quality Checks using Rules
 */
function runQualityChecks(engine: ReturnType<typeof createRuleEngine>) {
  console.log('\n=== Model Quality Checks ===\n');

  const checks: Array<{
    name: string;
    description: string;
    rule: SelectionRule;
    expectation: 'empty' | 'non-empty';
  }> = [
    {
      name: 'Unnamed Elements',
      description: 'Elements without a name should be reviewed',
      rule: {
        id: 'unnamed-elements',
        name: 'Unnamed Elements',
        conditions: [
          { type: 'entityType', entityType: ['IfcWall', 'IfcDoor', 'IfcWindow', 'IfcSlab'] },
          { type: 'attribute', attribute: 'name', operator: 'notExists', value: '' },
        ],
      },
      expectation: 'empty',
    },
    {
      name: 'External Walls Property',
      description: 'All walls should have IsExternal property defined',
      rule: {
        id: 'walls-missing-external',
        name: 'Walls Missing IsExternal',
        conditions: [
          { type: 'entityType', entityType: 'IfcWall' },
          { type: 'property', propertySet: 'Pset_WallCommon',
            propertyName: 'IsExternal', operator: 'notExists' },
        ],
      },
      expectation: 'empty',
    },
    {
      name: 'Fire-Rated Doors Check',
      description: 'Doors should have FireRating property',
      rule: {
        id: 'doors-missing-fire-rating',
        name: 'Doors Missing Fire Rating',
        conditions: [
          { type: 'entityType', entityType: 'IfcDoor' },
          { type: 'property', propertySet: 'Pset_DoorCommon',
            propertyName: 'FireRating', operator: 'notExists' },
        ],
      },
      expectation: 'empty',
    },
    {
      name: 'Load-Bearing Defined',
      description: 'Structural elements should have LoadBearing property',
      rule: {
        id: 'structural-missing-loadbearing',
        name: 'Structural Missing LoadBearing',
        conditions: [
          { type: 'entityType', entityType: ['IfcWall', 'IfcColumn', 'IfcBeam'] },
          { type: 'property', propertySet: '*',
            propertyName: 'LoadBearing', operator: 'notExists' },
        ],
      },
      expectation: 'empty',
    },
    {
      name: 'Classification Coverage',
      description: 'Elements should have at least one classification',
      rule: {
        id: 'missing-classification',
        name: 'Missing Classification',
        conditions: [
          { type: 'entityType', entityType: ['IfcWall', 'IfcDoor', 'IfcWindow'] },
          {
            type: 'not',
            conditions: [
              { type: 'classification', system: '*' }
            ]
          },
        ],
      },
      expectation: 'empty',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    const result = engine.select(check.rule);
    const success = check.expectation === 'empty'
      ? result.count === 0
      : result.count > 0;

    const status = success ? 'PASS' : 'FAIL';
    const icon = success ? '\u2714' : '\u2718';

    console.log(`${icon} ${status}: ${check.name}`);
    console.log(`   ${check.description}`);

    if (!success && check.expectation === 'empty') {
      console.log(`   Found ${result.count} issues`);

      // Show sample elements
      const samples = result.getElements().slice(0, 3);
      for (const el of samples) {
        console.log(`     - ${el.name || 'Unnamed'} (${el.type})`);
      }
      if (result.count > 3) {
        console.log(`     ... and ${result.count - 3} more`);
      }
    }
    console.log();

    if (success) passed++;
    else failed++;
  }

  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);
}

/**
 * Demo: Common Selection Patterns
 */
function demoSelectionPatterns(engine: ReturnType<typeof createRuleEngine>) {
  console.log('\n=== Selection Pattern Examples ===\n');

  // Pattern 1: By Type + Property
  console.log('1. External Load-Bearing Walls:');
  const structuralExtWalls = engine.query(
    RuleBuilder
      .select('IfcWall')
      .where('Pset_WallCommon.IsExternal').equals(true)
      .and('Pset_WallCommon.LoadBearing').equals(true)
      .build()
      .conditions
  );
  console.log(`   Found: ${structuralExtWalls.count}\n`);

  // Pattern 2: By Spatial Location
  console.log('2. Ground Floor Doors:');
  const groundFloorDoors = engine.query(
    RuleBuilder
      .select('IfcDoor')
      .onStorey('*Ground*')
      .build()
      .conditions
  );
  console.log(`   Found: ${groundFloorDoors.count}\n`);

  // Pattern 3: By Material
  console.log('3. Concrete Columns:');
  const concreteColumns = engine.query(
    RuleBuilder
      .select('IfcColumn')
      .withMaterial('*Concrete*')
      .build()
      .conditions
  );
  console.log(`   Found: ${concreteColumns.count}\n`);

  // Pattern 4: By Classification
  console.log('4. Structural Elements (by Uniclass):');
  const structuralUniclass = engine.query(
    RuleBuilder
      .select('*')
      .withClassification('Uniclass 2015', 'Ss_*')
      .build()
      .conditions
  );
  console.log(`   Found: ${structuralUniclass.count}\n`);

  // Pattern 5: By Quantity
  console.log('5. Thick Walls (>300mm):');
  const thickWalls = engine.query(
    RuleBuilder
      .select('IfcWall')
      .withQuantity('Qto_WallBaseQuantities.Width').greaterThan(0.3)
      .build()
      .conditions
  );
  console.log(`   Found: ${thickWalls.count}\n`);

  // Pattern 6: By Name Pattern
  console.log('6. Emergency Exit Doors:');
  const emergencyDoors = engine.query(
    RuleBuilder
      .select('IfcDoor')
      .whereName().matches('.*(Emergency|Fire Exit|Escape).*')
      .build()
      .conditions
  );
  console.log(`   Found: ${emergencyDoors.count}\n`);

  // Pattern 7: Complex OR conditions
  console.log('7. MEP Terminal Devices:');
  const mepTerminals = engine.select({
    id: 'mep-terminals',
    name: 'MEP Terminals',
    conditions: [
      {
        type: 'or',
        conditions: [
          { type: 'entityType', entityType: 'IfcFlowTerminal' },
          { type: 'entityType', entityType: 'IfcSanitaryTerminal' },
          { type: 'entityType', entityType: 'IfcLightFixture' },
          { type: 'entityType', entityType: 'IfcOutlet' },
        ],
      },
    ],
  });
  console.log(`   Found: ${mepTerminals.count}\n`);

  // Pattern 8: Combine multiple criteria
  console.log('8. Fire-Rated Doors on Escape Routes:');
  const fireEscapeDoors = engine.query(
    RuleBuilder
      .select('IfcDoor')
      .where('Pset_DoorCommon.FireRating').greaterOrEqual(30)
      .whereName().contains('Escape')
      .build()
      .conditions
  );
  console.log(`   Found: ${fireEscapeDoors.count}\n`);
}

/**
 * Main entry point
 */
async function main() {
  // In real usage, load an actual IFC file
  // const buffer = await fetch('model.ifc').then(r => r.arrayBuffer());

  // For this example, we'll simulate having already parsed
  console.log('Note: This example requires an actual IFC file to run.');
  console.log('Replace the fetch path with your IFC file.\n');

  // Uncomment when you have an IFC file:
  // const buffer = await fetch('/path/to/your/model.ifc').then(r => r.arrayBuffer());
  // const index = await parseAndIndex(buffer);
  // const engine = createRuleEngine(index);
  // runQualityChecks(engine);
  // demoSelectionPatterns(engine);

  // Show what the patterns look like
  console.log('=== Selection Rules Preview ===\n');

  const previewRules = [
    {
      name: 'External Walls',
      rule: RuleBuilder
        .select('IfcWall')
        .withId('ext-walls')
        .withName('External Walls')
        .where('Pset_WallCommon.IsExternal').equals(true)
        .build(),
    },
    {
      name: 'Fire Doors on Ground Floor',
      rule: RuleBuilder
        .select('IfcDoor')
        .withId('fire-doors-gf')
        .withName('Fire Doors - Ground Floor')
        .where('Pset_DoorCommon.FireRating').greaterOrEqual(30)
        .onStorey('*Ground*')
        .build(),
    },
    {
      name: 'Structural Concrete',
      rule: RuleBuilder
        .select(['IfcWall', 'IfcColumn', 'IfcBeam', 'IfcSlab'])
        .withId('structural-concrete')
        .withName('Structural Concrete Elements')
        .withMaterial('*Concrete*')
        .where('LoadBearing').equals(true)
        .build(),
    },
  ];

  for (const { name, rule } of previewRules) {
    console.log(`${name}:`);
    console.log(JSON.stringify(rule, null, 2));
    console.log();
  }
}

main().catch(console.error);
