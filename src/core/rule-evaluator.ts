/**
 * Rule Evaluator - Core engine for matching elements against selection rules
 *
 * This module evaluates selection rules against the unified element index
 * and returns matching elements.
 */

import type {
  UnifiedElement,
  ElementIndex,
  SelectionRule,
  SelectionResult,
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
  RuleEngine,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './types';

import {
  evaluateOperator,
  evaluateStringOperator,
  evaluateNumericOperator,
  matchesPattern,
} from '../operators';

/**
 * Evaluate a single condition against an element
 */
function evaluateCondition(element: UnifiedElement, condition: Condition): boolean {
  switch (condition.type) {
    case 'entityType':
      return evaluateTypeCondition(element, condition);

    case 'property':
      return evaluatePropertyCondition(element, condition);

    case 'spatial':
      return evaluateSpatialCondition(element, condition);

    case 'material':
      return evaluateMaterialCondition(element, condition);

    case 'classification':
      return evaluateClassificationCondition(element, condition);

    case 'attribute':
      return evaluateAttributeCondition(element, condition);

    case 'quantity':
      return evaluateQuantityCondition(element, condition);

    case 'relationship':
      return evaluateRelationshipCondition(element, condition);

    case 'or':
    case 'and':
    case 'not':
      return evaluateCompositeCondition(element, condition);

    default:
      console.warn(`Unknown condition type: ${(condition as Condition).type}`);
      return false;
  }
}

/**
 * Evaluate entity type condition
 */
function evaluateTypeCondition(element: UnifiedElement, condition: TypeCondition): boolean {
  const types = Array.isArray(condition.entityType)
    ? condition.entityType
    : [condition.entityType];

  const includeSubtypes = condition.includeSubtypes !== false; // default true

  for (const type of types) {
    if (includeSubtypes) {
      // Check if element's type or any of its supertypes match
      if (element.inheritanceChain.includes(type)) {
        // Check predefinedType if specified
        if (condition.predefinedType) {
          if (!matchesPattern(element.predefinedType, condition.predefinedType)) {
            continue;
          }
        }
        return true;
      }
    } else {
      // Exact type match only
      if (matchesPattern(element.type, type)) {
        if (condition.predefinedType) {
          if (!matchesPattern(element.predefinedType, condition.predefinedType)) {
            continue;
          }
        }
        return true;
      }
    }
  }

  return false;
}

/**
 * Evaluate property condition
 */
function evaluatePropertyCondition(element: UnifiedElement, condition: PropertyCondition): boolean {
  const { propertySet, propertyName, operator, value, valueTo } = condition;

  // Handle existence checks
  if (operator === 'exists' || operator === 'notExists') {
    const exists = findPropertyValue(element.properties, propertySet, propertyName) !== undefined;
    return operator === 'exists' ? exists : !exists;
  }

  // Find the property value
  const propValue = findPropertyValue(element.properties, propertySet, propertyName);

  if (propValue === undefined) {
    return operator === 'notEquals' || operator === 'notExists';
  }

  // Extract the actual value from PropertyValue object
  const actualValue = propValue.value;

  return evaluateOperator(actualValue, operator, value, valueTo);
}

/**
 * Find a property value across property sets
 */
function findPropertyValue(
  properties: Record<string, Record<string, { value: unknown }>>,
  propertySet: string,
  propertyName: string
): { value: unknown } | undefined {
  if (propertySet === '*') {
    // Search all property sets
    for (const psetName of Object.keys(properties)) {
      const pset = properties[psetName];
      if (pset && pset[propertyName] !== undefined) {
        return pset[propertyName];
      }
    }
    return undefined;
  }

  // Support wildcard in property set name
  if (propertySet.includes('*') || propertySet.includes('?')) {
    for (const psetName of Object.keys(properties)) {
      if (matchesPattern(psetName, propertySet)) {
        const pset = properties[psetName];
        if (pset && pset[propertyName] !== undefined) {
          return pset[propertyName];
        }
      }
    }
    return undefined;
  }

  // Exact match
  const pset = properties[propertySet];
  return pset?.[propertyName];
}

/**
 * Evaluate spatial condition
 */
function evaluateSpatialCondition(element: UnifiedElement, condition: SpatialCondition): boolean {
  const { level, name, elevation } = condition;

  // Get the spatial value for the specified level
  let spatialValue: string | undefined;
  let spatialElevation: number | undefined;

  switch (level) {
    case 'project':
      spatialValue = element.spatial.project;
      break;
    case 'site':
      spatialValue = element.spatial.site;
      break;
    case 'building':
      spatialValue = element.spatial.building;
      break;
    case 'storey':
      spatialValue = element.spatial.storey;
      spatialElevation = element.spatial.storeyElevation;
      break;
    case 'space':
      spatialValue = element.spatial.space;
      break;
  }

  // Check name match if specified
  if (name !== undefined) {
    if (!spatialValue || !matchesPattern(spatialValue, name)) {
      return false;
    }
  }

  // Check elevation if specified (only for storey)
  if (elevation !== undefined && level === 'storey') {
    if (spatialElevation === undefined) {
      return false;
    }
    if (!evaluateNumericOperator(spatialElevation, elevation.operator, elevation.value, elevation.valueTo)) {
      return false;
    }
  }

  // If we got here with name or elevation checks, we passed
  // If neither was specified, check that the spatial value exists
  if (name === undefined && elevation === undefined) {
    return spatialValue !== undefined;
  }

  return true;
}

/**
 * Evaluate material condition
 */
function evaluateMaterialCondition(element: UnifiedElement, condition: MaterialCondition): boolean {
  const { name, minThickness, maxThickness } = condition;

  if (!element.material) {
    return false;
  }

  // Check material name
  if (name !== undefined) {
    let nameMatches = matchesPattern(element.material.name, name);

    // Also check layer material names for layer sets
    if (!nameMatches && element.material.layers) {
      nameMatches = element.material.layers.some(layer =>
        matchesPattern(layer.material, name)
      );
    }

    if (!nameMatches) {
      return false;
    }
  }

  // Check thickness constraints (for layer sets)
  if (minThickness !== undefined || maxThickness !== undefined) {
    const thickness = element.material.totalThickness;
    if (thickness === undefined) {
      return false;
    }

    if (minThickness !== undefined && thickness < minThickness) {
      return false;
    }

    if (maxThickness !== undefined && thickness > maxThickness) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluate classification condition
 */
function evaluateClassificationCondition(element: UnifiedElement, condition: ClassificationCondition): boolean {
  const { system, code, name } = condition;

  if (element.classifications.length === 0) {
    return false;
  }

  return element.classifications.some(classification => {
    // Check system match
    if (system !== undefined && system !== '*') {
      if (!matchesPattern(classification.system, system)) {
        return false;
      }
    }

    // Check code match
    if (code !== undefined) {
      if (!matchesPattern(classification.code, code)) {
        return false;
      }
    }

    // Check name match
    if (name !== undefined) {
      if (!matchesPattern(classification.name, name)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Evaluate attribute condition
 */
function evaluateAttributeCondition(element: UnifiedElement, condition: AttributeCondition): boolean {
  const { attribute, operator, value } = condition;

  let attrValue: string | undefined;

  switch (attribute) {
    case 'name':
      attrValue = element.name;
      break;
    case 'description':
      attrValue = element.description;
      break;
    case 'tag':
      attrValue = element.tag;
      break;
    case 'objectType':
      attrValue = element.objectType;
      break;
    case 'predefinedType':
      attrValue = element.predefinedType;
      break;
  }

  return evaluateStringOperator(attrValue, operator, value);
}

/**
 * Evaluate quantity condition
 */
function evaluateQuantityCondition(element: UnifiedElement, condition: QuantityCondition): boolean {
  const { quantitySet, quantityName, operator, value, valueTo } = condition;

  // Find the quantity value
  let qtyValue: number | undefined;

  if (quantitySet && quantitySet !== '*') {
    // Search specific quantity set (with wildcard support)
    for (const qsetName of Object.keys(element.quantities)) {
      if (matchesPattern(qsetName, quantitySet)) {
        const qset = element.quantities[qsetName];
        if (qset && qset[quantityName] !== undefined) {
          qtyValue = qset[quantityName];
          break;
        }
      }
    }
  } else {
    // Search all quantity sets
    for (const qsetName of Object.keys(element.quantities)) {
      const qset = element.quantities[qsetName];
      if (qset && qset[quantityName] !== undefined) {
        qtyValue = qset[quantityName];
        break;
      }
    }
  }

  if (qtyValue === undefined) {
    return false;
  }

  return evaluateNumericOperator(qtyValue, operator, value, valueTo);
}

/**
 * Evaluate relationship condition
 */
function evaluateRelationshipCondition(element: UnifiedElement, condition: RelationshipCondition): boolean {
  const { relation, target } = condition;

  // For now, just check if the relationship exists
  // Full implementation would need access to the index to resolve targets

  switch (relation) {
    case 'containedIn':
      return element.relationships.containedIn !== undefined;

    case 'aggregatedBy':
      return element.relationships.aggregatedBy !== undefined;

    case 'connectedTo':
      return element.relationships.connectedTo !== undefined &&
             element.relationships.connectedTo.length > 0;

    case 'hasType':
      return element.relationships.hasType !== undefined;

    default:
      return false;
  }

  // TODO: If target is specified, resolve the related element and check its type/name
}

/**
 * Evaluate composite condition (AND, OR, NOT)
 */
function evaluateCompositeCondition(element: UnifiedElement, condition: CompositeCondition): boolean {
  switch (condition.type) {
    case 'or':
      return condition.conditions.some(c => evaluateCondition(element, c));

    case 'and':
      return condition.conditions.every(c => evaluateCondition(element, c));

    case 'not':
      // NOT applies to all conditions (must fail all)
      return !condition.conditions.some(c => evaluateCondition(element, c));

    default:
      return false;
  }
}

/**
 * Create a selection result object
 */
function createSelectionResult(
  expressIds: number[],
  rule: SelectionRule,
  index: ElementIndex,
  evaluationTime: number
): SelectionResult {
  return {
    expressIds,
    count: expressIds.length,
    rule,
    evaluationTime,

    getElements(): UnifiedElement[] {
      return expressIds
        .map(id => index.get(id))
        .filter((el): el is UnifiedElement => el !== undefined);
    },

    groupBy(property: keyof UnifiedElement | string): Map<string, number[]> {
      const groups = new Map<string, number[]>();

      for (const id of expressIds) {
        const element = index.get(id);
        if (!element) continue;

        let groupKey: string;

        if (property in element) {
          const value = element[property as keyof UnifiedElement];
          groupKey = String(value ?? 'undefined');
        } else if (property.includes('.')) {
          // Nested property path (e.g., "spatial.storey")
          const parts = property.split('.');
          let current: unknown = element;
          for (const part of parts) {
            current = (current as Record<string, unknown>)?.[part];
          }
          groupKey = String(current ?? 'undefined');
        } else {
          groupKey = 'undefined';
        }

        if (!groups.has(groupKey)) {
          groups.set(groupKey, []);
        }
        groups.get(groupKey)!.push(id);
      }

      return groups;
    },
  };
}

/**
 * Validate a selection rule
 */
function validateRule(rule: SelectionRule, index: ElementIndex): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check rule has conditions
  if (!rule.conditions || rule.conditions.length === 0) {
    errors.push({
      path: 'conditions',
      message: 'Rule must have at least one condition',
    });
  }

  // Validate each condition
  function validateCondition(condition: Condition, path: string): void {
    switch (condition.type) {
      case 'property':
        if (condition.propertySet !== '*' &&
            !condition.propertySet.includes('*') &&
            !index.propertySets.has(condition.propertySet)) {
          warnings.push({
            path: `${path}.propertySet`,
            message: `Property set "${condition.propertySet}" not found in model`,
            suggestion: `Available: ${Array.from(index.propertySets).slice(0, 5).join(', ')}...`,
          });
        }
        break;

      case 'classification':
        if (condition.system && condition.system !== '*' &&
            !condition.system.includes('*') &&
            !index.classificationSystems.has(condition.system)) {
          warnings.push({
            path: `${path}.system`,
            message: `Classification system "${condition.system}" not found in model`,
            suggestion: `Available: ${Array.from(index.classificationSystems).join(', ')}`,
          });
        }
        break;

      case 'or':
      case 'and':
      case 'not':
        condition.conditions.forEach((c, i) => {
          validateCondition(c, `${path}.conditions[${i}]`);
        });
        break;
    }
  }

  rule.conditions.forEach((condition, i) => {
    validateCondition(condition, `conditions[${i}]`);
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Create a rule engine instance
 */
export function createRuleEngine(index: ElementIndex): RuleEngine {
  return {
    index,

    select(rule: SelectionRule): SelectionResult {
      const startTime = performance.now();

      const matchedIds: number[] = [];
      const mode = rule.mode || 'all';

      // Iterate all elements
      for (const element of index) {
        let matches: boolean;

        if (mode === 'all') {
          // All conditions must match (AND)
          matches = rule.conditions.every(condition =>
            evaluateCondition(element, condition)
          );
        } else {
          // Any condition must match (OR)
          matches = rule.conditions.some(condition =>
            evaluateCondition(element, condition)
          );
        }

        if (matches) {
          matchedIds.push(element.expressId);
        }
      }

      const evaluationTime = performance.now() - startTime;

      return createSelectionResult(matchedIds, rule, index, evaluationTime);
    },

    query(conditions: Condition | Condition[]): SelectionResult {
      const conditionsArray = Array.isArray(conditions) ? conditions : [conditions];

      const rule: SelectionRule = {
        id: 'inline-query',
        name: 'Inline Query',
        conditions: conditionsArray,
      };

      return this.select(rule);
    },

    validate(rule: SelectionRule): ValidationResult {
      return validateRule(rule, index);
    },
  };
}
