/**
 * useLiveMatching - Real-time rule evaluation with debouncing
 *
 * Evaluates rules against the element index as conditions change,
 * with debouncing to avoid excessive re-evaluation.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useIfcStore, selectIndex, selectViewer } from '../stores/ifc-store';
import { useRuleStore, selectConditions } from '../stores/rule-store';
import { createRuleEngine } from '../../../src/core/rule-evaluator';
import type { SelectionRule, RuleEngine } from '../../../src/core/types';

const DEBOUNCE_MS = 100;

export function useLiveMatching() {
  const index = useIfcStore(selectIndex);
  const viewer = useIfcStore(selectViewer);
  const conditions = useRuleStore(selectConditions);

  const setMatchResult = useRuleStore(state => state.setMatchResult);
  const setEvaluating = useRuleStore(state => state.setEvaluating);
  const clearMatches = useRuleStore(state => state.clearMatches);

  const engineRef = useRef<RuleEngine | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create engine when index changes
  useEffect(() => {
    if (index) {
      engineRef.current = createRuleEngine(index);
    } else {
      engineRef.current = null;
    }
  }, [index]);

  // Evaluate on condition changes (debounced)
  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // If no conditions, clear matches
    if (conditions.length === 0) {
      clearMatches();
      viewer?.clearHighlights();
      return;
    }

    // If no engine, skip
    if (!engineRef.current) {
      return;
    }

    // Set evaluating state
    setEvaluating(true);

    // Debounced evaluation
    timeoutRef.current = setTimeout(() => {
      const engine = engineRef.current;
      if (!engine) return;

      try {
        const rule: SelectionRule = {
          id: 'live-rule',
          name: 'Live Rule',
          conditions,
        };

        const result = engine.select(rule);
        setMatchResult(result);

        // Update viewer highlights
        if (viewer && result.expressIds.length > 0) {
          viewer.highlightMatched(result.expressIds);
        } else if (viewer) {
          viewer.clearHighlights();
        }
      } catch (error) {
        console.error('Rule evaluation failed:', error);
        setEvaluating(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [conditions, viewer, setMatchResult, setEvaluating, clearMatches]);
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
