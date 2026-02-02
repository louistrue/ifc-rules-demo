/**
 * useLiveMatching - Real-time rule evaluation
 *
 * Evaluates rules against the element index as conditions change.
 * Evaluation is immediate for responsive UI when clicking rules.
 */

import { useEffect, useMemo, useCallback } from 'react';
import { useIfcStore, selectIndex } from '../stores/ifc-store';
import { useRuleStore, selectConditions } from '../stores/rule-store';
import { createRuleEngine } from '../../../src/core/rule-evaluator';
import type { SelectionRule, RuleEngine } from '../../../src/core/types';

export function useLiveMatching() {
  const index = useIfcStore(selectIndex);
  const conditions = useRuleStore(selectConditions);

  const setMatchResult = useRuleStore(state => state.setMatchResult);
  const setEvaluating = useRuleStore(state => state.setEvaluating);
  const clearMatches = useRuleStore(state => state.clearMatches);

  // Create engine when index changes (useMemo so it's part of render cycle)
  const engine = useMemo<RuleEngine | null>(() => {
    if (index) {
      return createRuleEngine(index);
    }
    return null;
  }, [index]);

  // Evaluate when EITHER conditions OR engine changes (ensures re-eval when file loads)
  useEffect(() => {
    // If no conditions, clear matches immediately
    if (conditions.length === 0) {
      clearMatches();
      return;
    }

    // If no engine (no file loaded), skip but don't clear
    if (!engine) {
      return;
    }

    // Evaluate immediately
    setEvaluating(true);
    
    try {
      const rule: SelectionRule = {
        id: 'live-rule',
        name: 'Live Rule',
        conditions,
      };

      const result = engine.select(rule);
      console.log('[LiveMatching] Evaluated rule:', {
        conditions: conditions.length,
        matched: result.count,
        time: result.evaluationTime.toFixed(2) + 'ms'
      });
      setMatchResult(result);
    } catch (error) {
      console.error('Rule evaluation failed:', error);
      setEvaluating(false);
    }
  }, [conditions, engine, setMatchResult, setEvaluating, clearMatches]);
}

/**
 * useRuleEvaluator - Imperative rule evaluation hook
 */
export function useRuleEvaluator() {
  const index = useIfcStore(selectIndex);

  const evaluate = useCallback((rule: SelectionRule) => {
    if (!index) {
      throw new Error('No IFC data loaded');
    }

    const engine = createRuleEngine(index);
    return engine.select(rule);
  }, [index]);

  const validate = useCallback((rule: SelectionRule) => {
    if (!index) {
      throw new Error('No IFC data loaded');
    }

    const engine = createRuleEngine(index);
    return engine.validate(rule);
  }, [index]);

  return { evaluate, validate };
}

export default useLiveMatching;
