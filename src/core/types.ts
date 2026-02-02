/**
 * Core types for rule-based IFC element selection
 *
 * This module defines the data structures for:
 * - Unified element representation (denormalized view of IFC entities)
 * - Rule definitions (JSON-based selection criteria)
 * - Query results
 */

// ============================================================================
// Unified Element Model
// ============================================================================

export interface PropertyValue {
  type: 'string' | 'number' | 'boolean' | 'null';
  value: string | number | boolean | null;
  unit?: string;
}

export interface MaterialLayer {
  material: string;
  thickness: number;
  isVentilated?: boolean;
  priority?: number;
}

export interface ElementMaterial {
  name: string;
  type: 'single' | 'layerSet' | 'profileSet' | 'constituentSet';
  layers?: MaterialLayer[];
  totalThickness?: number;
}

export interface ElementClassification {
  system: string;
  code: string;
  name: string;
  path: string[];
}

export interface SpatialLocation {
  project?: string;
  site?: string;
  building?: string;
  storey?: string;
  space?: string;
  storeyElevation?: number;
}

export interface ElementRelationships {
  containedIn?: number;
  aggregatedBy?: number;
  connectedTo?: number[];
  hasOpenings?: number[];
  fillsOpening?: number;
  hasType?: number;
}

export interface BoundingBox {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Unified element interface - denormalized view of an IFC entity
 * with all related data (properties, materials, spatial, etc.) attached
 */
export interface UnifiedElement {
  // Core identity
  expressId: number;
  globalId: string;

  // Type information
  type: string;
  predefinedType?: string;
  objectType?: string;
  inheritanceChain: string[];

  // Basic attributes
  name?: string;
  description?: string;
  tag?: string;

  // Spatial location
  spatial: SpatialLocation;

  // Properties (from PropertySets)
  // Structure: { "Pset_WallCommon": { "IsExternal": { type: "boolean", value: true } } }
  properties: Record<string, Record<string, PropertyValue>>;

  // Quantities (from QuantitySets)
  // Structure: { "Qto_WallBaseQuantities": { "GrossVolume": 12.5 } }
  quantities: Record<string, Record<string, number>>;

  // Materials
  material?: ElementMaterial;

  // Classifications
  classifications: ElementClassification[];

  // Relationships
  relationships: ElementRelationships;

  // Geometry bounds
  bounds?: BoundingBox;
}

// ============================================================================
// Element Index
// ============================================================================

export interface ElementIndex {
  /** All elements by expressId */
  elements: Map<number, UnifiedElement>;

  /** Elements grouped by type */
  byType: Map<string, Set<number>>;

  /** Elements grouped by storey */
  byStorey: Map<string, Set<number>>;

  /** Elements grouped by classification code */
  byClassification: Map<string, Set<number>>;

  /** Elements grouped by material name */
  byMaterial: Map<string, Set<number>>;

  /** Available property sets in the model */
  propertySets: Set<string>;

  /** Available classification systems in the model */
  classificationSystems: Set<string>;

  /** Get element by expressId */
  get(expressId: number): UnifiedElement | undefined;

  /** Get all elements of a type (including subtypes) */
  getByType(type: string, includeSubtypes?: boolean): UnifiedElement[];

  /** Iterate all elements */
  [Symbol.iterator](): Iterator<UnifiedElement>;
}

// ============================================================================
// Rule Definitions
// ============================================================================

export type ComparisonOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'between'
  | 'exists'
  | 'notExists';

export type NumericOperator =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'between';

export type StringOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'matches';

// Condition types
export interface TypeCondition {
  type: 'entityType';
  entityType: string | string[];
  includeSubtypes?: boolean;
  predefinedType?: string;
}

export interface PropertyCondition {
  type: 'property';
  propertySet: string;
  propertyName: string;
  operator: ComparisonOperator;
  value?: string | number | boolean | null;
  valueTo?: number; // For 'between' operator
}

export interface SpatialCondition {
  type: 'spatial';
  level: 'project' | 'site' | 'building' | 'storey' | 'space';
  name?: string;
  elevation?: {
    operator: NumericOperator;
    value: number;
    valueTo?: number;
  };
}

export interface MaterialCondition {
  type: 'material';
  name?: string;
  minThickness?: number;
  maxThickness?: number;
}

export interface ClassificationCondition {
  type: 'classification';
  system?: string;
  code?: string;
  name?: string;
}

export interface AttributeCondition {
  type: 'attribute';
  attribute: 'name' | 'description' | 'tag' | 'objectType' | 'predefinedType';
  operator: StringOperator;
  value: string;
}

export interface QuantityCondition {
  type: 'quantity';
  quantitySet?: string;
  quantityName: string;
  operator: NumericOperator;
  value: number;
  valueTo?: number;
}

export interface RelationshipCondition {
  type: 'relationship';
  relation: 'containedIn' | 'aggregatedBy' | 'connectedTo' | 'hasType';
  target?: {
    type?: string;
    name?: string;
  };
}

export interface CompositeCondition {
  type: 'or' | 'and' | 'not';
  conditions: Condition[];
}

export type Condition =
  | TypeCondition
  | PropertyCondition
  | SpatialCondition
  | MaterialCondition
  | ClassificationCondition
  | AttributeCondition
  | QuantityCondition
  | RelationshipCondition
  | CompositeCondition;

/**
 * A selection rule - defines criteria for selecting IFC elements
 */
export interface SelectionRule {
  id: string;
  name: string;
  description?: string;
  conditions: Condition[];
  mode?: 'all' | 'any'; // all = AND, any = OR (default: 'all')
}

// ============================================================================
// Query Results
// ============================================================================

export interface SelectionResult {
  /** Express IDs of matched elements */
  expressIds: number[];

  /** Count of matched elements */
  count: number;

  /** The rule that was evaluated */
  rule: SelectionRule;

  /** Time taken to evaluate (ms) */
  evaluationTime: number;

  /** Get matched elements (lazy) */
  getElements(): UnifiedElement[];

  /** Group results by a property */
  groupBy(property: keyof UnifiedElement | string): Map<string, number[]>;
}

// ============================================================================
// Rule Engine Interface
// ============================================================================

export interface RuleEngine {
  /** The element index being queried */
  readonly index: ElementIndex;

  /** Execute a selection rule */
  select(rule: SelectionRule): SelectionResult;

  /** Execute a rule defined inline */
  query(conditions: Condition | Condition[]): SelectionResult;

  /** Validate a rule without executing */
  validate(rule: SelectionRule): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  condition?: Condition;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}
