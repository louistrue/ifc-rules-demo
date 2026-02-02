/**
 * useKeyboardShortcuts - Global keyboard shortcuts for the app
 */

import { useEffect } from 'react';
import { useRuleStore } from '../stores/rule-store';
import { useIfcStore } from '../stores/ifc-store';

export function useKeyboardShortcuts() {
  const togglePanel = useRuleStore(state => state.togglePanel);
  const closePanel = useRuleStore(state => state.closePanel);
  const clearConditions = useRuleStore(state => state.clearConditions);
  const setViewMode = useRuleStore(state => state.setViewMode);
  const viewer = useIfcStore(state => state.viewer);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K: Toggle rule builder
      if (isMod && e.key === 'k') {
        e.preventDefault();
        togglePanel();
        return;
      }

      // Escape: Close panel or clear selection
      if (e.key === 'Escape') {
        closePanel();
        return;
      }

      // H: Toggle hide mode
      if (e.key === 'h' || e.key === 'H') {
        setViewMode('hide');
        return;
      }

      // I: Toggle isolate mode
      if (e.key === 'i' || e.key === 'I') {
        setViewMode('isolate');
        return;
      }

      // R: Reset view (show all)
      if (e.key === 'r' || e.key === 'R') {
        viewer?.showAll();
        clearConditions();
        return;
      }

      // F: Fit to matched elements
      if (e.key === 'f' || e.key === 'F') {
        const matchedIds = useRuleStore.getState().matchedIds;
        if (matchedIds.length > 0) {
          viewer?.fitToElements(matchedIds);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel, closePanel, clearConditions, setViewMode, viewer]);
}

export default useKeyboardShortcuts;
