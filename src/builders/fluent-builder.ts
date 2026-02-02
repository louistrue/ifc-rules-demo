/**
 * Fluent Builder API for constructing selection rules
 *
 * Provides a chainable, readable API for building rules:
 *
 * @example
 * const rule = RuleBuilder
 *   .select('IfcWall')
 *   .where('Pset_WallCommon.IsExternal').equals(true)
 *   .and('Pset_WallCommon.LoadBearing').equals(true)
 *   .onStorey('Ground Floor')
 *   .withMaterial('*Concrete*')
 *   .build();
 */

import type {
  SelectionRule,
  Condition,
  TypeCondition,
  PropertyCondition,
  SpatialCondition,
  MaterialCondition,
  ClassificationCondition,
  AttributeCondition,
  QuantityCondition,
  ComparisonOperator,
  NumericOperator,
  StringOperator,
} from '../core/types';

/**
 * Property condition builder - for chaining comparison operators
 */
class PropertyConditionBuilder {
  private builder: RuleBuilderImpl;
  private propertySet: string;
  private propertyName: string;

  constructor(builder: RuleBuilderImpl, propertyPath: string) {
    this.builder = builder;

    // Parse "Pset_WallCommon.IsExternal" into set and name
    const parts = propertyPath.split('.');
    if (parts.length === 2) {
      this.propertySet = parts[0];
      this.propertyName = parts[1];
    } else {
      // Assume it's just a property name, search all sets
      this.propertySet = '*';
      this.propertyName = propertyPath;
    }
  }

  equals(value: string | number | boolean): RuleBuilderImpl {
    return this.addCondition('equals', value);
  }

  notEquals(value: string | number | boolean): RuleBuilderImpl {
    return this.addCondition('notEquals', value);
  }

  contains(value: string): RuleBuilderImpl {
    return this.addCondition('contains', value);
  }

  startsWith(value: string): RuleBuilderImpl {
    return this.addCondition('startsWith', value);
  }

  endsWith(value: string): RuleBuilderImpl {
    return this.addCondition('endsWith', value);
  }

  matches(regex: string): RuleBuilderImpl {
    return this.addCondition('matches', regex);
  }

  greaterThan(value: number): RuleBuilderImpl {
    return this.addCondition('greaterThan', value);
  }

  lessThan(value: number): RuleBuilderImpl {
    return this.addCondition('lessThan', value);
  }

  greaterOrEqual(value: number): RuleBuilderImpl {
    return this.addCondition('greaterOrEqual', value);
  }

  lessOrEqual(value: number): RuleBuilderImpl {
    return this.addCondition('lessOrEqual', value);
  }

  between(min: number, max: number): RuleBuilderImpl {
    const condition: PropertyCondition = {
      type: 'property',
      propertySet: this.propertySet,
      propertyName: this.propertyName,
      operator: 'between',
      value: min,
      valueTo: max,
    };
    this.builder.addCondition(condition);
    return this.builder;
  }

  exists(): RuleBuilderImpl {
    return this.addCondition('exists', undefined as unknown as string);
  }

  notExists(): RuleBuilderImpl {
    return this.addCondition('notExists', undefined as unknown as string);
  }

  private addCondition(operator: ComparisonOperator, value: string | number | boolean): RuleBuilderImpl {
    const condition: PropertyCondition = {
      type: 'property',
      propertySet: this.propertySet,
      propertyName: this.propertyName,
      operator,
      value,
    };
    this.builder.addCondition(condition);
    return this.builder;
  }
}

/**
 * Quantity condition builder
 */
class QuantityConditionBuilder {
  private builder: RuleBuilderImpl;
  private quantitySet?: string;
  private quantityName: string;

  constructor(builder: RuleBuilderImpl, quantityPath: string) {
    this.builder = builder;

    const parts = quantityPath.split('.');
    if (parts.length === 2) {
      this.quantitySet = parts[0];
      this.quantityName = parts[1];
    } else {
      this.quantityName = quantityPath;
    }
  }

  equals(value: number): RuleBuilderImpl {
    return this.addCondition('equals', value);
  }

  greaterThan(value: number): RuleBuilderImpl {
    return this.addCondition('greaterThan', value);
  }

  lessThan(value: number): RuleBuilderImpl {
    return this.addCondition('lessThan', value);
  }

  greaterOrEqual(value: number): RuleBuilderImpl {
    return this.addCondition('greaterOrEqual', value);
  }

  lessOrEqual(value: number): RuleBuilderImpl {
    return this.addCondition('lessOrEqual', value);
  }

  between(min: number, max: number): RuleBuilderImpl {
    const condition: QuantityCondition = {
      type: 'quantity',
      quantitySet: this.quantitySet,
      quantityName: this.quantityName,
      operator: 'between',
      value: min,
      valueTo: max,
    };
    this.builder.addCondition(condition);
    return this.builder;
  }

  private addCondition(operator: NumericOperator, value: number): RuleBuilderImpl {
    const condition: QuantityCondition = {
      type: 'quantity',
      quantitySet: this.quantitySet,
      quantityName: this.quantityName,
      operator,
      value,
    };
    this.builder.addCondition(condition);
    return this.builder;
  }
}

/**
 * Attribute condition builder
 */
class AttributeConditionBuilder {
  private builder: RuleBuilderImpl;
  private attribute: 'name' | 'description' | 'tag' | 'objectType' | 'predefinedType';

  constructor(
    builder: RuleBuilderImpl,
    attribute: 'name' | 'description' | 'tag' | 'objectType' | 'predefinedType'
  ) {
    this.builder = builder;
    this.attribute = attribute;
  }

  equals(value: string): RuleBuilderImpl {
    return this.addCondition('equals', value);
  }

  notEquals(value: string): RuleBuilderImpl {
    return this.addCondition('notEquals', value);
  }

  contains(value: string): RuleBuilderImpl {
    return this.addCondition('contains', value);
  }

  startsWith(value: string): RuleBuilderImpl {
    return this.addCondition('startsWith', value);
  }

  endsWith(value: string): RuleBuilderImpl {
    return this.addCondition('endsWith', value);
  }

  matches(regex: string): RuleBuilderImpl {
    return this.addCondition('matches', regex);
  }

  private addCondition(operator: StringOperator, value: string): RuleBuilderImpl {
    const condition: AttributeCondition = {
      type: 'attribute',
      attribute: this.attribute,
      operator,
      value,
    };
    this.builder.addCondition(condition);
    return this.builder;
  }
}

/**
 * Main rule builder implementation
 */
class RuleBuilderImpl {
  private ruleId: string;
  private ruleName: string;
  private ruleDescription?: string;
  private conditions: Condition[] = [];
  private mode: 'all' | 'any' = 'all';

  constructor(entityTypes?: string | string[]) {
    this.ruleId = `rule-${Date.now()}`;
    this.ruleName = 'Unnamed Rule';

    if (entityTypes) {
      const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes];
      if (types.length > 0 && types[0] !== '*') {
        this.conditions.push({
          type: 'entityType',
          entityType: types,
          includeSubtypes: true,
        } as TypeCondition);
      }
    }
  }

  /**
   * Add a condition (used internally)
   */
  addCondition(condition: Condition): this {
    this.conditions.push(condition);
    return this;
  }

  /**
   * Set rule metadata
   */
  withId(id: string): this {
    this.ruleId = id;
    return this;
  }

  withName(name: string): this {
    this.ruleName = name;
    return this;
  }

  withDescription(description: string): this {
    this.ruleDescription = description;
    return this;
  }

  /**
   * Add a property condition
   */
  where(propertyPath: string): PropertyConditionBuilder {
    return new PropertyConditionBuilder(this, propertyPath);
  }

  /**
   * Alias for where (for chaining after first condition)
   */
  and(propertyPath: string): PropertyConditionBuilder {
    return new PropertyConditionBuilder(this, propertyPath);
  }

  /**
   * Add a quantity condition
   */
  withQuantity(quantityPath: string): QuantityConditionBuilder {
    return new QuantityConditionBuilder(this, quantityPath);
  }

  /**
   * Add attribute conditions
   */
  whereName(): AttributeConditionBuilder {
    return new AttributeConditionBuilder(this, 'name');
  }

  whereDescription(): AttributeConditionBuilder {
    return new AttributeConditionBuilder(this, 'description');
  }

  whereTag(): AttributeConditionBuilder {
    return new AttributeConditionBuilder(this, 'tag');
  }

  whereObjectType(): AttributeConditionBuilder {
    return new AttributeConditionBuilder(this, 'objectType');
  }

  /**
   * Add spatial condition - on a specific storey
   */
  onStorey(name: string): this {
    const condition: SpatialCondition = {
      type: 'spatial',
      level: 'storey',
      name,
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add spatial condition - by storey elevation
   */
  onStoreyAtElevation(elevation: number, tolerance = 1): this {
    const condition: SpatialCondition = {
      type: 'spatial',
      level: 'storey',
      elevation: {
        operator: 'between',
        value: elevation - tolerance,
        valueTo: elevation + tolerance,
      },
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add spatial condition - in a building
   */
  inBuilding(name: string): this {
    const condition: SpatialCondition = {
      type: 'spatial',
      level: 'building',
      name,
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add spatial condition - in a space
   */
  inSpace(name: string): this {
    const condition: SpatialCondition = {
      type: 'spatial',
      level: 'space',
      name,
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add material condition
   */
  withMaterial(name: string): this {
    const condition: MaterialCondition = {
      type: 'material',
      name,
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add material condition with thickness
   */
  withMaterialThickness(min?: number, max?: number): this {
    const condition: MaterialCondition = {
      type: 'material',
      minThickness: min,
      maxThickness: max,
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add classification condition
   */
  withClassification(system: string, code?: string): this {
    const condition: ClassificationCondition = {
      type: 'classification',
      system,
      code,
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add classification by code only (any system)
   */
  withClassificationCode(code: string): this {
    const condition: ClassificationCondition = {
      type: 'classification',
      system: '*',
      code,
    };
    this.conditions.push(condition);
    return this;
  }

  /**
   * Add predefined type condition
   */
  withPredefinedType(predefinedType: string): this {
    // Modify existing type condition or add attribute condition
    const typeCondition = this.conditions.find(c => c.type === 'entityType') as TypeCondition | undefined;
    if (typeCondition) {
      typeCondition.predefinedType = predefinedType;
    } else {
      const condition: AttributeCondition = {
        type: 'attribute',
        attribute: 'predefinedType',
        operator: 'equals',
        value: predefinedType,
      };
      this.conditions.push(condition);
    }
    return this;
  }

  /**
   * Add OR condition group
   */
  or(builderFn: (or: OrBuilder) => void): this {
    const orBuilder = new OrBuilder();
    builderFn(orBuilder);
    if (orBuilder.conditions.length > 0) {
      this.conditions.push({
        type: 'or',
        conditions: orBuilder.conditions,
      });
    }
    return this;
  }

  /**
   * Set match mode to ANY (OR logic for top-level conditions)
   */
  matchAny(): this {
    this.mode = 'any';
    return this;
  }

  /**
   * Build the final rule
   */
  build(): SelectionRule {
    return {
      id: this.ruleId,
      name: this.ruleName,
      description: this.ruleDescription,
      conditions: this.conditions,
      mode: this.mode,
    };
  }
}

/**
 * Or condition builder
 */
class OrBuilder {
  conditions: Condition[] = [];

  type(entityType: string | string[]): this {
    this.conditions.push({
      type: 'entityType',
      entityType,
      includeSubtypes: true,
    });
    return this;
  }

  property(propertySet: string, propertyName: string, value: unknown): this {
    this.conditions.push({
      type: 'property',
      propertySet,
      propertyName,
      operator: 'equals',
      value: value as string | number | boolean,
    });
    return this;
  }

  classification(system: string, code?: string): this {
    this.conditions.push({
      type: 'classification',
      system,
      code,
    });
    return this;
  }

  material(name: string): this {
    this.conditions.push({
      type: 'material',
      name,
    });
    return this;
  }
}

/**
 * Static entry point for the fluent builder
 */
export const RuleBuilder = {
  /**
   * Start building a rule for specific entity type(s)
   *
   * @example
   * RuleBuilder.select('IfcWall')
   * RuleBuilder.select(['IfcWall', 'IfcCurtainWall'])
   * RuleBuilder.select('*')  // All elements
   */
  select(entityType: string | string[]): RuleBuilderImpl {
    return new RuleBuilderImpl(entityType);
  },

  /**
   * Start building a rule without type filter
   */
  all(): RuleBuilderImpl {
    return new RuleBuilderImpl();
  },

  /**
   * Create a rule from conditions array
   */
  fromConditions(conditions: Condition[]): RuleBuilderImpl {
    const builder = new RuleBuilderImpl();
    for (const condition of conditions) {
      builder.addCondition(condition);
    }
    return builder;
  },
};

// Export types for external use
export type { RuleBuilderImpl as RuleBuilderType };
