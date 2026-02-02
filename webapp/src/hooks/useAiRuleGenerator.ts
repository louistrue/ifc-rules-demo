/**
 * Hook for generating IFC selection rules from natural language using OpenAI
 */

import { useState, useCallback } from 'react';
import { useIfcStore, selectSchema, selectEntityTypes, selectStoreys, selectPropertySets, selectMaterials } from '../stores/ifc-store';
import { useRuleStore } from '../stores/rule-store';
import type { SelectionRule } from '../../../src/core/types';

interface IfcContext {
  entityTypes: Array<{ type: string; count: number }>;
  storeys: Array<{ name: string; elevation: number; elementCount: number }>;
  propertySets: Array<{ name: string; elementCount: number }>;
  materials: Array<{ name: string; elementCount: number }>;
}

export function useAiRuleGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGeneratedRule, setLastGeneratedRule] = useState<SelectionRule | null>(null);

  const schema = useIfcStore(selectSchema);
  const entityTypes = useIfcStore(selectEntityTypes);
  const storeys = useIfcStore(selectStoreys);
  const propertySets = useIfcStore(selectPropertySets);
  const materials = useIfcStore(selectMaterials);
  const loadRule = useRuleStore(state => state.loadRule);

  const generateRule = useCallback(async (prompt: string) => {
    if (!prompt.trim()) {
      setError('Please enter a query');
      return;
    }

    if (!schema) {
      setError('Please load an IFC file first');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Build context from current IFC schema
      const context: IfcContext = {
        entityTypes: entityTypes.map(et => ({
          type: et.type,
          count: et.count,
        })),
        storeys: storeys.map(s => ({
          name: s.name,
          elevation: s.elevation,
          elementCount: s.elementCount,
        })),
        propertySets: propertySets.map(ps => ({
          name: ps.name,
          elementCount: ps.elementCount,
        })),
        materials: materials.map(m => ({
          name: m.name,
          elementCount: m.elementCount,
        })),
      };

      // Call API
      const response = await fetch('/api/generate-rule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, context }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.rule) {
        throw new Error('Invalid response from server');
      }

      // Validate rule structure
      const rule = data.rule as SelectionRule;
      if (!rule.conditions || !Array.isArray(rule.conditions)) {
        throw new Error('Invalid rule structure: missing conditions');
      }

      // Load rule into store (this will trigger live matching)
      loadRule(rule);
      setLastGeneratedRule(rule);

    } catch (err: any) {
      console.error('Error generating rule:', err);
      setError(err.message || 'Failed to generate rule. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [schema, entityTypes, storeys, propertySets, materials, loadRule]);

  return {
    generateRule,
    isGenerating,
    error,
    lastGeneratedRule,
  };
}
