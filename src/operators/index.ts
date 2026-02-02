/**
 * Comparison operators for rule evaluation
 *
 * These operators handle the comparison logic for different data types
 * and support wildcards/glob patterns for flexible matching.
 */

import type { ComparisonOperator, NumericOperator, StringOperator } from '../core/types';

/**
 * Convert a glob-style pattern to a regex
 * Supports: * (any chars), ? (single char)
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\*/g, '.*')                  // * -> .*
    .replace(/\?/g, '.');                  // ? -> .

  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Check if a value matches a pattern (supports wildcards)
 */
export function matchesPattern(value: string | undefined | null, pattern: string): boolean {
  if (value === undefined || value === null) return false;

  // If pattern has wildcards, use regex
  if (pattern.includes('*') || pattern.includes('?')) {
    const regex = globToRegex(pattern);
    return regex.test(value);
  }

  // Otherwise, case-insensitive exact match
  return value.toLowerCase() === pattern.toLowerCase();
}

/**
 * Evaluate a string comparison operator
 */
export function evaluateStringOperator(
  value: string | undefined | null,
  operator: StringOperator,
  compareValue: string
): boolean {
  if (value === undefined || value === null) {
    return operator === 'notEquals';
  }

  const lowerValue = value.toLowerCase();
  const lowerCompare = compareValue.toLowerCase();

  switch (operator) {
    case 'equals':
      return matchesPattern(value, compareValue);

    case 'notEquals':
      return !matchesPattern(value, compareValue);

    case 'contains':
      // Support wildcards in contains
      if (compareValue.includes('*') || compareValue.includes('?')) {
        return matchesPattern(value, `*${compareValue}*`);
      }
      return lowerValue.includes(lowerCompare);

    case 'notContains':
      if (compareValue.includes('*') || compareValue.includes('?')) {
        return !matchesPattern(value, `*${compareValue}*`);
      }
      return !lowerValue.includes(lowerCompare);

    case 'startsWith':
      if (compareValue.includes('*') || compareValue.includes('?')) {
        return matchesPattern(value, `${compareValue}*`);
      }
      return lowerValue.startsWith(lowerCompare);

    case 'endsWith':
      if (compareValue.includes('*') || compareValue.includes('?')) {
        return matchesPattern(value, `*${compareValue}`);
      }
      return lowerValue.endsWith(lowerCompare);

    case 'matches':
      // Full regex match
      try {
        const regex = new RegExp(compareValue, 'i');
        return regex.test(value);
      } catch {
        return false;
      }

    default:
      return false;
  }
}

/**
 * Evaluate a numeric comparison operator
 */
export function evaluateNumericOperator(
  value: number | undefined | null,
  operator: NumericOperator,
  compareValue: number,
  compareTo?: number
): boolean {
  if (value === undefined || value === null || isNaN(value)) {
    return operator === 'notEquals';
  }

  switch (operator) {
    case 'equals':
      return Math.abs(value - compareValue) < 0.0001; // Float tolerance

    case 'notEquals':
      return Math.abs(value - compareValue) >= 0.0001;

    case 'greaterThan':
      return value > compareValue;

    case 'lessThan':
      return value < compareValue;

    case 'greaterOrEqual':
      return value >= compareValue;

    case 'lessOrEqual':
      return value <= compareValue;

    case 'between':
      if (compareTo === undefined) return false;
      return value >= compareValue && value <= compareTo;

    default:
      return false;
  }
}

/**
 * Evaluate a general comparison operator (handles both string and numeric)
 */
export function evaluateOperator(
  value: unknown,
  operator: ComparisonOperator,
  compareValue?: unknown,
  compareTo?: number
): boolean {
  // Handle existence operators
  if (operator === 'exists') {
    return value !== undefined && value !== null;
  }

  if (operator === 'notExists') {
    return value === undefined || value === null;
  }

  // Handle null value
  if (value === null || value === undefined) {
    return operator === 'notEquals' || operator === 'notExists';
  }

  // Handle comparison based on value type
  if (typeof value === 'number' && typeof compareValue === 'number') {
    return evaluateNumericOperator(value, operator as NumericOperator, compareValue, compareTo);
  }

  if (typeof value === 'boolean') {
    const boolCompare = compareValue === true || compareValue === 'true' || compareValue === '.T.';
    switch (operator) {
      case 'equals':
        return value === boolCompare;
      case 'notEquals':
        return value !== boolCompare;
      default:
        return false;
    }
  }

  // String comparison (convert to string if needed)
  const strValue = String(value);
  const strCompare = String(compareValue ?? '');
  return evaluateStringOperator(strValue, operator as StringOperator, strCompare);
}

/**
 * Parse a numeric value from various formats
 */
export function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    // Handle IFC format numbers
    const parsed = parseFloat(value.replace(',', '.'));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Parse a boolean value from various formats
 */
export function parseBooleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === '.T.' || value === 'true' || value === 'TRUE' || value === '1') return true;
  if (value === '.F.' || value === 'false' || value === 'FALSE' || value === '0') return false;
  return null;
}
