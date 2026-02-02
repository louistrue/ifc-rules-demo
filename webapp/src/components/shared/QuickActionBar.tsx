/**
 * QuickActionBar - Minimal bottom action bar
 *
 * Provides quick access to common actions without cluttering the 3D view.
 */

import React, { useRef } from 'react';
import { useIfcStore } from '../../stores/ifc-store';
import { useRuleStore } from '../../stores/rule-store';

export function QuickActionBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const file = useIfcStore(state => state.file);
  const isLoading = useIfcStore(state => state.isLoading);

  const isOpen = useRuleStore(state => state.isOpen);
  const togglePanel = useRuleStore(state => state.togglePanel);
  const matchCount = useRuleStore(state => state.matchCount);
  const savedRules = useRuleStore(state => state.savedRules);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Load file logic would go here
    console.log('Loading file:', files[0].name);
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/90 backdrop-blur rounded-full shadow-lg border border-gray-700">
        {/* Load File */}
        <button
          onClick={handleFileClick}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
          title="Load IFC file (Cmd+O)"
        >
          <span>📁</span>
          <span className="hidden sm:inline">
            {file ? file.name : 'Load IFC'}
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".ifc"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Divider */}
        <div className="w-px h-6 bg-gray-600" />

        {/* Rule Builder Toggle */}
        <button
          onClick={togglePanel}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
            isOpen
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
          title="Toggle Rule Builder (Cmd+K)"
        >
          <span>🔍</span>
          <span className="hidden sm:inline">Rules</span>
          {matchCount > 0 && (
            <span className="px-1.5 py-0.5 bg-blue-500 rounded-full text-xs">
              {matchCount}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-600" />

        {/* Saved Rules */}
        <button
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
          title="Saved Rules"
        >
          <span>📋</span>
          <span className="hidden sm:inline">Library</span>
          {savedRules.length > 0 && (
            <span className="px-1.5 py-0.5 bg-gray-600 rounded-full text-xs">
              {savedRules.length}
            </span>
          )}
        </button>

        {/* Keyboard Shortcuts Hint */}
        <div className="hidden lg:flex items-center gap-1 ml-2 text-xs text-gray-500">
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">⌘K</kbd>
          <span>rules</span>
        </div>
      </div>
    </div>
  );
}

export default QuickActionBar;
