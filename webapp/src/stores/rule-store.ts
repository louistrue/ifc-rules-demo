/**
 * Rule Store - State for rule builder and matching
 *
 * Manages the current rule being built, matched elements,
 * and saved rules library.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SelectionRule, Condition, SelectionResult } from '../../../src/core/types';

// ============================================================================
// Types
// ============================================================================

interface RuleBuilderState {
  // UI state
  isOpen: boolean;
  isLibraryOpen: boolean;
  isPinned: boolean;
  position: { x: number; y: number };

  // Current rule being built
  currentRule: SelectionRule;
  conditions: Condition[];

  // Matching results
  matchedIds: number[];
  matchCount: number;
  evaluationTime: number;
  isEvaluating: boolean;

  // Saved rules
  savedRules: SelectionRule[];

  // View modes ('none' = show all normally)
  viewMode: 'none' | 'highlight' | 'isolate' | 'hide';
  dimNonMatched: boolean;
}

interface RuleStoreActions {
  // Panel actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  toggleLibrary: () => void;
  setPinned: (pinned: boolean) => void;
  setPosition: (position: { x: number; y: number }) => void;

  // Rule building
  setEntityType: (type: string | string[]) => void;
  addEntityType: (type: string) => void;
  removeEntityType: (type: string) => void;
  addCondition: (condition: Condition) => void;
  updateCondition: (index: number, condition: Condition) => void;
  removeCondition: (index: number) => void;
  clearConditions: () => void;
  setRule: (rule: SelectionRule) => void;

  // Matching
  setMatchResult: (result: SelectionResult) => void;
  setEvaluating: (evaluating: boolean) => void;
  clearMatches: () => void;

  // View modes
  setViewMode: (mode: 'none' | 'highlight' | 'isolate' | 'hide') => void;
  setDimNonMatched: (dim: boolean) => void;

  // Saved rules
  saveCurrentRule: (name: string) => void;
  loadRule: (rule: SelectionRule) => void;
  deleteRule: (id: string) => void;
  exportRules: () => string;
  importRules: (json: string) => void;
}

type RuleStore = RuleBuilderState & RuleStoreActions;

// ============================================================================
// Default values
// ============================================================================

const defaultRule: SelectionRule = {
  id: 'new-rule',
  name: 'New Rule',
  conditions: [],
};

const defaultState: RuleBuilderState = {
  isOpen: false,
  isLibraryOpen: false,
  isPinned: false,
  position: { x: 20, y: 100 },
  currentRule: defaultRule,
  conditions: [],
  matchedIds: [],
  matchCount: 0,
  evaluationTime: 0,
  isEvaluating: false,
  savedRules: [],
  viewMode: 'none',
  dimNonMatched: true,
};

// ============================================================================
// Store
// ============================================================================

export const useRuleStore = create<RuleStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // Panel actions
      openPanel: () => set({ isOpen: true }),
      closePanel: () => set({ isOpen: false }),
      togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
      toggleLibrary: () => set((s) => ({ isLibraryOpen: !s.isLibraryOpen })),
      setPinned: (isPinned) => set({ isPinned }),
      setPosition: (position) => set({ position }),

      // Rule building
      setEntityType: (type) => {
        const types = Array.isArray(type) ? type : [type];
        const typeCondition: Condition = {
          type: 'entityType',
          entityType: types.length === 1 ? types[0] : types,
          includeSubtypes: true,
        };

        set((s) => {
          // Replace existing type condition or add new one
          const otherConditions = s.conditions.filter(c => c.type !== 'entityType');
          const newConditions = types.length > 0 ? [typeCondition, ...otherConditions] : otherConditions;

          return {
            conditions: newConditions,
            currentRule: { ...s.currentRule, conditions: newConditions },
            // Auto-enable highlight when building rules
            viewMode: s.viewMode === 'none' ? 'highlight' : s.viewMode,
          };
        });
      },

      // Add a type to the current selection (for multi-select)
      addEntityType: (type: string) => {
        set((s) => {
          const existingTypeCondition = s.conditions.find(c => c.type === 'entityType');
          let currentTypes: string[] = [];
          
          if (existingTypeCondition && existingTypeCondition.type === 'entityType') {
            const et = existingTypeCondition.entityType;
            currentTypes = Array.isArray(et) ? [...et] : (et ? [et] : []);
          }
          
          // Don't add if already exists
          if (currentTypes.includes(type)) return s;
          
          const newTypes = [...currentTypes, type];
          const typeCondition: Condition = {
            type: 'entityType',
            entityType: newTypes.length === 1 ? newTypes[0] : newTypes,
            includeSubtypes: true,
          };
          
          const otherConditions = s.conditions.filter(c => c.type !== 'entityType');
          const newConditions = [typeCondition, ...otherConditions];
          
          return {
            conditions: newConditions,
            currentRule: { ...s.currentRule, conditions: newConditions },
            viewMode: s.viewMode === 'none' ? 'highlight' : s.viewMode,
          };
        });
      },

      // Remove a single type from the selection
      removeEntityType: (type: string) => {
        set((s) => {
          const existingTypeCondition = s.conditions.find(c => c.type === 'entityType');
          let currentTypes: string[] = [];
          
          if (existingTypeCondition && existingTypeCondition.type === 'entityType') {
            const et = existingTypeCondition.entityType;
            currentTypes = Array.isArray(et) ? [...et] : (et ? [et] : []);
          }
          
          const newTypes = currentTypes.filter(t => t !== type);
          
          if (newTypes.length === 0) {
            // No types left, remove the type condition entirely
            const newConditions = s.conditions.filter(c => c.type !== 'entityType');
            return {
              conditions: newConditions,
              currentRule: { ...s.currentRule, conditions: newConditions },
            };
          }
          
          const typeCondition: Condition = {
            type: 'entityType',
            entityType: newTypes.length === 1 ? newTypes[0] : newTypes,
            includeSubtypes: true,
          };
          
          const otherConditions = s.conditions.filter(c => c.type !== 'entityType');
          const newConditions = [typeCondition, ...otherConditions];
          
          return {
            conditions: newConditions,
            currentRule: { ...s.currentRule, conditions: newConditions },
          };
        });
      },

      addCondition: (condition) => {
        set((s) => {
          const newConditions = [...s.conditions, condition];
          return {
            conditions: newConditions,
            currentRule: { ...s.currentRule, conditions: newConditions },
            // Auto-enable highlight when adding conditions
            viewMode: s.viewMode === 'none' ? 'highlight' : s.viewMode,
          };
        });
      },

      updateCondition: (index, condition) => {
        set((s) => {
          const newConditions = [...s.conditions];
          newConditions[index] = condition;
          return {
            conditions: newConditions,
            currentRule: { ...s.currentRule, conditions: newConditions },
          };
        });
      },

      removeCondition: (index) => {
        set((s) => {
          const newConditions = s.conditions.filter((_, i) => i !== index);
          return {
            conditions: newConditions,
            currentRule: { ...s.currentRule, conditions: newConditions },
          };
        });
      },

      clearConditions: () => {
        set({
          conditions: [],
          currentRule: { ...defaultRule, id: `rule-${Date.now()}` },
          matchedIds: [],
          matchCount: 0,
        });
      },

      setRule: (rule) => {
        set({
          currentRule: rule,
          conditions: rule.conditions,
        });
      },

      // Matching
      setMatchResult: (result) => {
        set({
          matchedIds: result.expressIds,
          matchCount: result.count,
          evaluationTime: result.evaluationTime,
          isEvaluating: false,
        });
      },

      setEvaluating: (isEvaluating) => set({ isEvaluating }),

      clearMatches: () => {
        set({
          matchedIds: [],
          matchCount: 0,
          evaluationTime: 0,
        });
      },

      // View modes
      setViewMode: (viewMode) => set({ viewMode }),
      setDimNonMatched: (dimNonMatched) => set({ dimNonMatched }),

      // Saved rules
      saveCurrentRule: (name) => {
        set((s) => {
          const rule: SelectionRule = {
            ...s.currentRule,
            id: `rule-${Date.now()}`,
            name,
            conditions: s.conditions,
          };

          return {
            savedRules: [...s.savedRules, rule],
          };
        });
      },

      loadRule: (rule) => {
        set((s) => ({
          currentRule: rule,
          conditions: rule.conditions,
          isOpen: true,
          // Auto-enable highlight when loading a rule
          viewMode: s.viewMode === 'none' ? 'highlight' : s.viewMode,
        }));
      },

      deleteRule: (id) => {
        set((s) => ({
          savedRules: s.savedRules.filter(r => r.id !== id),
        }));
      },

      exportRules: () => {
        const { savedRules } = get();
        return JSON.stringify(savedRules, null, 2);
      },

      importRules: (json) => {
        try {
          const rules = JSON.parse(json) as SelectionRule[];
          set((s) => ({
            savedRules: [...s.savedRules, ...rules],
          }));
        } catch (e) {
          console.error('Failed to import rules:', e);
        }
      },
    }),
    {
      name: 'ifc-rules-storage',
      partialize: (state) => ({
        savedRules: state.savedRules,
        position: state.position,
        dimNonMatched: state.dimNonMatched,
        viewMode: state.viewMode,
      }),
    }
  )
);

// ============================================================================
// Selectors
// ============================================================================

export const selectIsOpen = (state: RuleStore) => state.isOpen;
export const selectConditions = (state: RuleStore) => state.conditions;
export const selectMatchedIds = (state: RuleStore) => state.matchedIds;
export const selectMatchCount = (state: RuleStore) => state.matchCount;
export const selectSavedRules = (state: RuleStore) => state.savedRules;
export const selectViewMode = (state: RuleStore) => state.viewMode;

// Get current entity type condition
export const selectCurrentEntityType = (state: RuleStore): string | string[] | null => {
  const typeCondition = state.conditions.find(c => c.type === 'entityType');
  if (typeCondition && typeCondition.type === 'entityType') {
    return typeCondition.entityType;
  }
  return null;
};

// Get conditions excluding entity type
export const selectNonTypeConditions = (state: RuleStore): Condition[] => {
  return state.conditions.filter(c => c.type !== 'entityType');
};
