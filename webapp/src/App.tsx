/**
 * IFC Rules Demo App
 *
 * Minimal 3D viewer with smart rule-based element selection.
 *
 * Features:
 * - Full-screen 3D viewer (no menus, no panels, just 3D)
 * - Floating rule builder with autocomplete from actual model data
 * - Live highlighting as rules are built
 * - Keyboard shortcuts for power users
 */

import React from 'react';
import { IfcViewer } from './components/viewer/IfcViewer';
import { RuleBuilderPanel } from './components/rule-builder/RuleBuilderPanel';
import { QuickActionBar } from './components/shared/QuickActionBar';
import { LibraryPanel } from './components/shared/LibraryPanel';
import { useLiveMatching } from './hooks/useLiveMatching';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export function App() {
  // Initialize hooks
  useLiveMatching();
  useKeyboardShortcuts();

  return (
    <div className="w-screen h-screen bg-gray-900 overflow-hidden">
      {/* Full-screen 3D Viewer */}
      <IfcViewer className="absolute inset-0" />

      {/* Floating Rule Builder Panel */}
      <RuleBuilderPanel />

      {/* Rule Library Panel */}
      <LibraryPanel />

      {/* Bottom Quick Action Bar */}
      <QuickActionBar />
    </div>
  );
}

export default App;
