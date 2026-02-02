/**
 * IFC Rules - Rule-based IFC element selection
 *
 * A library for selecting IFC elements using semantic criteria instead of GUIDs.
 *
 * @example
 * ```typescript
 * import { IfcParser } from '@ifc-lite/parser';
 * import { buildElementIndex, createRuleEngine, RuleBuilder } from '@ifc-rules/core';
 *
 * // Parse IFC file
 * const parser = new IfcParser();
 * const result = await parser.parse(ifcBuffer);
 *
 * // Build index
 * const index = await buildElementIndex(result);
 *
 * // Create rule engine
 * const engine = createRuleEngine(index);
 *
 * // Select elements
 * const externalWalls = engine.select({
 *   id: 'external-walls',
 *   name: 'External Walls',
 *   conditions: [
 *     { type: 'entityType', entityType: 'IfcWall' },
 *     { type: 'property', propertySet: 'Pset_WallCommon',
 *       propertyName: 'IsExternal', operator: 'equals', value: true }
 *   ]
 * });
 *
 * // Or use fluent builder
 * const result = engine.query(
 *   RuleBuilder
 *     .select('IfcDoor')
 *     .where('Pset_DoorCommon.FireRating').greaterThan(30)
 *     .onStorey('Ground Floor')
 *     .build()
 *     .conditions
 * );
 * ```
 */

// Core types
export type {
  // Element types
  UnifiedElement,
  PropertyValue,
  ElementMaterial,
  MaterialLayer,
  ElementClassification,
  SpatialLocation,
  ElementRelationships,
  BoundingBox,

  // Index types
  ElementIndex,

  // Rule types
  SelectionRule,
  Condition,
  TypeCondition,
  PropertyCondition,
  SpatialCondition,
  MaterialCondition,
  ClassificationCondition,
  AttributeCondition,
  QuantityCondition,
  RelationshipCondition,
  CompositeCondition,

  // Operator types
  ComparisonOperator,
  NumericOperator,
  StringOperator,

  // Result types
  SelectionResult,
  RuleEngine,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './core/types';

// Core functions
export { buildElementIndex, extractPropertySetsMap } from './core/element-indexer';
export { createRuleEngine } from './core/rule-evaluator';

// Operators
export {
  globToRegex,
  matchesPattern,
  evaluateOperator,
  evaluateStringOperator,
  evaluateNumericOperator,
  parseNumericValue,
  parseBooleanValue,
} from './operators';

// Fluent builder
export { RuleBuilder } from './builders/fluent-builder';
export type { RuleBuilderType } from './builders/fluent-builder';
