/**
 * LibraryPanel - Shows saved rules with ability to load, edit, or delete
 */

import React, { useState } from 'react';
import { useRuleStore } from '../../stores/rule-store';
import type { SelectionRule } from '../../../../src/core/types';

// Built-in sample rules
const SAMPLE_RULES: { category: string; rules: SelectionRule[] }[] = [
  {
    category: 'Fire Safety',
    rules: [
      {
        id: 'fire-rated-doors',
        name: 'Fire-Rated Doors',
        description: 'Doors with any fire rating',
        conditions: [
          { type: 'entityType', entityType: 'IfcDoor', includeSubtypes: true },
          { type: 'property', propertySet: 'Pset_DoorCommon', propertyName: 'FireRating', operator: 'exists' },
        ],
      },
      {
        id: 'fire-doors-30min',
        name: 'Fire Doors (30+ min)',
        description: 'Doors with 30 minute or higher fire rating',
        conditions: [
          { type: 'entityType', entityType: 'IfcDoor', includeSubtypes: true },
          { type: 'property', propertySet: 'Pset_DoorCommon', propertyName: 'FireRating', operator: 'greaterOrEqual', value: 30 },
        ],
      },
      {
        id: 'fire-rated-walls',
        name: 'Fire-Rated Walls',
        description: 'Walls with fire rating property',
        conditions: [
          { type: 'entityType', entityType: 'IfcWall', includeSubtypes: true },
          { type: 'property', propertySet: 'Pset_WallCommon', propertyName: 'FireRating', operator: 'exists' },
        ],
      },
    ],
  },
  {
    category: 'Structural',
    rules: [
      {
        id: 'all-walls',
        name: 'All Walls',
        description: 'Select all wall elements',
        conditions: [
          { type: 'entityType', entityType: ['IfcWall', 'IfcWallStandardCase', 'IfcCurtainWall'], includeSubtypes: true },
        ],
      },
      {
        id: 'external-walls',
        name: 'External Walls',
        description: 'Walls marked as external',
        conditions: [
          { type: 'entityType', entityType: 'IfcWall', includeSubtypes: true },
          { type: 'property', propertySet: 'Pset_WallCommon', propertyName: 'IsExternal', operator: 'equals', value: true },
        ],
      },
      {
        id: 'load-bearing-walls',
        name: 'Load-Bearing Walls',
        description: 'Structural walls that are load-bearing',
        conditions: [
          { type: 'entityType', entityType: 'IfcWall', includeSubtypes: true },
          { type: 'property', propertySet: 'Pset_WallCommon', propertyName: 'LoadBearing', operator: 'equals', value: true },
        ],
      },
      {
        id: 'all-columns',
        name: 'All Columns',
        description: 'Select all column elements',
        conditions: [
          { type: 'entityType', entityType: 'IfcColumn', includeSubtypes: true },
        ],
      },
      {
        id: 'all-beams',
        name: 'All Beams',
        description: 'Select all beam elements',
        conditions: [
          { type: 'entityType', entityType: 'IfcBeam', includeSubtypes: true },
        ],
      },
      {
        id: 'all-slabs',
        name: 'All Slabs',
        description: 'Select all slab/floor elements',
        conditions: [
          { type: 'entityType', entityType: 'IfcSlab', includeSubtypes: true },
        ],
      },
    ],
  },
  {
    category: 'Spatial',
    rules: [
      {
        id: 'large-spaces',
        name: 'Large Spaces (>50m²)',
        description: 'Spaces with net floor area over 50 square meters',
        conditions: [
          { type: 'entityType', entityType: 'IfcSpace', includeSubtypes: true },
          { type: 'quantity', quantityName: 'NetFloorArea', operator: 'greaterThan', value: 50 },
        ],
      },
      {
        id: 'exterior-elements',
        name: 'All Exterior Elements',
        description: 'Elements marked as external',
        conditions: [
          { type: 'property', propertySet: '*', propertyName: 'IsExternal', operator: 'equals', value: true },
        ],
      },
    ],
  },
];

export function LibraryPanel() {
  const isLibraryOpen = useRuleStore(state => state.isLibraryOpen);
  const savedRules = useRuleStore(state => state.savedRules);
  const currentRule = useRuleStore(state => state.currentRule);
  const toggleLibrary = useRuleStore(state => state.toggleLibrary);
  const loadRule = useRuleStore(state => state.loadRule);
  const clearConditions = useRuleStore(state => state.clearConditions);
  const deleteRule = useRuleStore(state => state.deleteRule);
  const exportRules = useRuleStore(state => state.exportRules);
  const importRules = useRuleStore(state => state.importRules);
  
  const [activeTab, setActiveTab] = useState<'samples' | 'saved'>('samples');

  // Toggle rule: load if different, clear if same
  const handleRuleClick = (rule: SelectionRule) => {
    if (currentRule.id === rule.id) {
      // Same rule - clear it
      clearConditions();
    } else {
      // Different rule - load it
      loadRule(rule);
    }
  };

  if (!isLibraryOpen) return null;

  const handleExport = () => {
    const json = exportRules();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ifc-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        importRules(text);
      }
    };
    input.click();
  };

  return (
    <div className="fixed right-4 top-4 bottom-20 w-80 bg-gray-800/95 backdrop-blur rounded-lg shadow-xl border border-gray-700 flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-white font-medium">Rule Library</h2>
        <button
          onClick={toggleLibrary}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('samples')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'samples'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Samples
        </button>
        <button
          onClick={() => setActiveTab('saved')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'saved'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          My Rules {savedRules.length > 0 && `(${savedRules.length})`}
        </button>
      </div>

      {/* Rules List */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === 'samples' ? (
          /* Sample Rules by Category */
          <div className="space-y-4">
            {SAMPLE_RULES.map((category) => (
              <div key={category.category}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">
                  {category.category}
                </h3>
                <div className="space-y-1">
                  {category.rules.map((rule) => {
                    const isActive = currentRule.id === rule.id;
                    return (
                      <button
                        key={rule.id}
                        onClick={() => handleRuleClick(rule)}
                        className={`w-full text-left rounded-lg p-3 transition-colors group ${
                          isActive
                            ? 'bg-blue-600 hover:bg-blue-500'
                            : 'bg-gray-700/30 hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-white font-medium text-sm">{rule.name}</span>
                          <span className={`text-xs transition-opacity ${
                            isActive
                              ? 'text-white opacity-100'
                              : 'text-blue-400 opacity-0 group-hover:opacity-100'
                          }`}>
                            {isActive ? '✓ Active' : 'Load →'}
                          </span>
                        </div>
                        {rule.description && (
                          <p className={`text-xs mt-1 ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>
                            {rule.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Saved Rules */
          savedRules.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <div className="text-4xl mb-2">📋</div>
              <p>No saved rules yet</p>
              <p className="text-sm mt-1">Create a rule and save it to see it here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedRules.map((rule) => {
                const isActive = currentRule.id === rule.id;
                return (
                  <div
                    key={rule.id}
                    className={`rounded-lg p-3 transition-colors ${
                      isActive
                        ? 'bg-blue-600 hover:bg-blue-500'
                        : 'bg-gray-700/50 hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{rule.name}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleRuleClick(rule)}
                          className={`px-2 py-1 text-xs rounded ${
                            isActive
                              ? 'bg-blue-500 hover:bg-blue-400 text-white'
                              : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
                        >
                          {isActive ? 'Clear' : 'Load'}
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="px-2 py-1 text-xs bg-red-600/50 hover:bg-red-600 text-white rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-gray-400'}`}>
                      {rule.conditions.length} condition{rule.conditions.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-gray-700 flex gap-2">
        <button
          onClick={handleImport}
          className="flex-1 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
        >
          Import
        </button>
        <button
          onClick={handleExport}
          disabled={savedRules.length === 0}
          className="flex-1 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export
        </button>
      </div>
    </div>
  );
}

export default LibraryPanel;
