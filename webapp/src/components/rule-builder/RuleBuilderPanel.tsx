/**
 * Rule Builder Panel - Smart UI for building selection rules
 *
 * Features:
 * - Floating, draggable panel
 * - Entity type selector with counts from loaded model
 * - Property conditions with autocomplete from actual data
 * - Live match count as you build
 */

import React, { useState, useCallback } from 'react';
import { useIfcStore, selectSchema, selectEntityTypes, selectStoreys } from '../../stores/ifc-store';
import { useRuleStore, selectConditions, selectMatchCount, selectCurrentEntityType } from '../../stores/rule-store';
import type { Condition, PropertyCondition, SpatialCondition, MaterialCondition } from '../../../../src/core/types';
import { getPropertySetsForType, getSuggestedConditions } from '../../lib/schema-extractor';

// ============================================================================
// Main Panel Component
// ============================================================================

export function RuleBuilderPanel() {
  const isOpen = useRuleStore(state => state.isOpen);
  const position = useRuleStore(state => state.position);
  const isPinned = useRuleStore(state => state.isPinned);
  const closePanel = useRuleStore(state => state.closePanel);
  const setPosition = useRuleStore(state => state.setPosition);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y,
    });
  }, [isDragging, dragOffset, setPosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-96 select-none"
      style={{
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-gray-700 cursor-move"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-white font-medium">Rule Builder</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => useRuleStore.getState().setPinned(!isPinned)}
            className={`p-1 rounded hover:bg-gray-700 ${isPinned ? 'text-blue-400' : 'text-gray-400'}`}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
            </svg>
          </button>
          <button
            onClick={closePanel}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        <TypeSelector />
        <ConditionsList />
        <AddConditionButton />
      </div>

      {/* Footer with match count */}
      <MatchCountFooter />
    </div>
  );
}

// ============================================================================
// Type Selector
// ============================================================================

function TypeSelector() {
  const schema = useIfcStore(selectSchema);
  const entityTypes = useIfcStore(selectEntityTypes);
  const currentType = useRuleStore(selectCurrentEntityType);
  const setEntityType = useRuleStore(state => state.setEntityType);

  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Filter types by search
  const filteredTypes = entityTypes.filter(t =>
    t.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTypes = Array.isArray(currentType) ? currentType : (currentType ? [currentType] : []);

  const handleTypeToggle = (type: string) => {
    if (selectedTypes.includes(type)) {
      const newTypes = selectedTypes.filter(t => t !== type);
      setEntityType(newTypes.length === 1 ? newTypes[0] : newTypes);
    } else {
      setEntityType([...selectedTypes, type]);
    }
  };

  if (!schema) {
    return (
      <div className="text-gray-400 text-sm">
        Load an IFC file to see available types
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-400">Element Type</label>

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 bg-gray-700 rounded-lg text-left text-white flex items-center justify-between hover:bg-gray-600"
        >
          <span>
            {selectedTypes.length === 0
              ? 'Select type...'
              : selectedTypes.length === 1
                ? selectedTypes[0]
                : `${selectedTypes.length} types selected`}
          </span>
          <span className="text-gray-400">▼</span>
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 rounded-lg shadow-lg border border-gray-600 z-10 max-h-60 overflow-y-auto">
            {/* Search input */}
            <div className="p-2 border-b border-gray-600">
              <input
                type="text"
                placeholder="Search types..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1 bg-gray-800 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Type list */}
            <div className="p-1">
              {filteredTypes.map(({ type, count }) => (
                <button
                  key={type}
                  onClick={() => handleTypeToggle(type)}
                  className={`w-full px-3 py-2 rounded flex items-center justify-between text-sm ${
                    selectedTypes.includes(type)
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-200 hover:bg-gray-600'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-4 h-4 border rounded ${
                      selectedTypes.includes(type)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-500'
                    }`}>
                      {selectedTypes.includes(type) && '✓'}
                    </span>
                    {type}
                  </span>
                  <span className="text-gray-400">({count})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Selected type chips */}
      {selectedTypes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTypes.map(type => (
            <span
              key={type}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600/30 text-blue-300 rounded text-sm"
            >
              {type}
              <button
                onClick={() => handleTypeToggle(type)}
                className="hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Conditions List
// ============================================================================

function ConditionsList() {
  const conditions = useRuleStore(selectConditions);
  const removeCondition = useRuleStore(state => state.removeCondition);

  // Filter out the type condition (shown separately)
  const displayConditions = conditions.filter(c => c.type !== 'entityType');

  if (displayConditions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-400">Conditions</label>
      <div className="space-y-2">
        {displayConditions.map((condition, index) => (
          <ConditionChip
            key={index}
            condition={condition}
            onRemove={() => {
              // Find actual index in full conditions array
              const actualIndex = conditions.indexOf(condition);
              removeCondition(actualIndex);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Condition Chip
// ============================================================================

interface ConditionChipProps {
  condition: Condition;
  onRemove: () => void;
}

function ConditionChip({ condition, onRemove }: ConditionChipProps) {
  const getConditionText = (): string => {
    switch (condition.type) {
      case 'property': {
        const c = condition as PropertyCondition;
        return `${c.propertySet}.${c.propertyName} ${c.operator} ${JSON.stringify(c.value)}`;
      }
      case 'spatial': {
        const c = condition as SpatialCondition;
        return `${c.level}: ${c.name || `elevation ${c.elevation?.operator} ${c.elevation?.value}`}`;
      }
      case 'material': {
        const c = condition as MaterialCondition;
        return `Material: ${c.name || 'any'}`;
      }
      case 'classification':
        return `Classification: ${condition.system || '*'}:${condition.code || '*'}`;
      default:
        return condition.type;
    }
  };

  const getConditionIcon = () => {
    switch (condition.type) {
      case 'property':
        return <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
      case 'spatial':
        return <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
      case 'material':
        return <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>;
      case 'classification':
        return <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>;
      case 'quantity':
        return <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
      default:
        return <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg group">
      {getConditionIcon()}
      <span className="flex-1 text-sm text-gray-200 truncate">
        {getConditionText()}
      </span>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-opacity"
      >
        ×
      </button>
    </div>
  );
}

// ============================================================================
// Add Condition Button
// ============================================================================

function AddConditionButton() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeConditionType, setActiveConditionType] = useState<string | null>(null);

  const conditionTypes = [
    { id: 'property', label: 'Property', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
    { id: 'spatial', label: 'Spatial (Storey)', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
    { id: 'material', label: 'Material', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
    { id: 'classification', label: 'Classification', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg> },
    { id: 'quantity', label: 'Quantity', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> },
    { id: 'attribute', label: 'Name/Attribute', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> },
  ];

  if (activeConditionType) {
    return (
      <ConditionEditor
        type={activeConditionType}
        onClose={() => setActiveConditionType(null)}
      />
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="w-full px-3 py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 flex items-center justify-center gap-2"
      >
        <span>+</span>
        <span>Add condition</span>
      </button>

      {isMenuOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 rounded-lg shadow-lg border border-gray-600 z-10">
          {conditionTypes.map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => {
                setActiveConditionType(id);
                setIsMenuOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-gray-200 hover:bg-gray-600 flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg"
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Condition Editor
// ============================================================================

interface ConditionEditorProps {
  type: string;
  onClose: () => void;
}

function ConditionEditor({ type, onClose }: ConditionEditorProps) {
  switch (type) {
    case 'property':
      return <PropertyConditionEditor onClose={onClose} />;
    case 'spatial':
      return <SpatialConditionEditor onClose={onClose} />;
    case 'material':
      return <MaterialConditionEditor onClose={onClose} />;
    default:
      return (
        <div className="p-3 bg-gray-700 rounded-lg">
          <div className="text-gray-400 text-sm mb-2">
            {type} condition editor coming soon
          </div>
          <button
            onClick={onClose}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Cancel
          </button>
        </div>
      );
  }
}

// ============================================================================
// Property Condition Editor
// ============================================================================

function PropertyConditionEditor({ onClose }: { onClose: () => void }) {
  const schema = useIfcStore(selectSchema);
  const currentType = useRuleStore(selectCurrentEntityType);
  const addCondition = useRuleStore(state => state.addCondition);

  const [pset, setPset] = useState('');
  const [prop, setProp] = useState('');
  const [operator, setOperator] = useState('equals');
  const [value, setValue] = useState('');

  // Get property sets for current type
  const selectedTypes = Array.isArray(currentType) ? currentType : (currentType ? [currentType] : []);
  const availablePsets = schema && selectedTypes.length > 0
    ? getPropertySetsForType(schema, selectedTypes)
    : schema?.propertySets || [];

  // Get properties for selected pset
  const selectedPset = availablePsets.find(p => p.name === pset);
  const availableProps = selectedPset?.properties || [];

  // Get sample values for selected property
  const selectedProp = availableProps.find(p => p.name === prop);
  const sampleValues = selectedProp?.values || [];

  const handleAdd = () => {
    if (!pset || !prop) return;

    let parsedValue: string | number | boolean = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(Number(value))) parsedValue = Number(value);

    addCondition({
      type: 'property',
      propertySet: pset,
      propertyName: prop,
      operator: operator as PropertyCondition['operator'],
      value: parsedValue,
    });

    onClose();
  };

  return (
    <div className="p-3 bg-gray-700 rounded-lg space-y-3">
      <div className="text-sm text-white font-medium flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <span>Property Condition</span>
      </div>

      {/* Property Set */}
      <div>
        <label className="text-xs text-gray-400">Property Set</label>
        <select
          value={pset}
          onChange={(e) => { setPset(e.target.value); setProp(''); }}
          className="w-full mt-1 px-2 py-1.5 bg-gray-800 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select property set...</option>
          {availablePsets.map(p => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.elementCount})
            </option>
          ))}
        </select>
      </div>

      {/* Property */}
      {pset && (
        <div>
          <label className="text-xs text-gray-400">Property</label>
          <select
            value={prop}
            onChange={(e) => setProp(e.target.value)}
            className="w-full mt-1 px-2 py-1.5 bg-gray-800 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Select property...</option>
            {availableProps.map(p => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.valueType}, {p.frequency} elements)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Operator and Value */}
      {prop && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-400">Operator</label>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 bg-gray-800 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="equals">equals</option>
              <option value="notEquals">not equals</option>
              <option value="contains">contains</option>
              <option value="greaterThan">greater than</option>
              <option value="lessThan">less than</option>
              <option value="exists">exists</option>
              <option value="notExists">not exists</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400">Value</label>
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full mt-1 px-2 py-1.5 bg-gray-800 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select value...</option>
              {sampleValues.map((v, i) => (
                <option key={i} value={String(v.value)}>
                  {String(v.value)} ({v.count})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!pset || !prop}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Spatial Condition Editor
// ============================================================================

function SpatialConditionEditor({ onClose }: { onClose: () => void }) {
  const storeys = useIfcStore(selectStoreys);
  const addCondition = useRuleStore(state => state.addCondition);

  const [selectedStorey, setSelectedStorey] = useState('');

  const handleAdd = () => {
    if (!selectedStorey) return;

    addCondition({
      type: 'spatial',
      level: 'storey',
      name: selectedStorey,
    });

    onClose();
  };

  return (
    <div className="p-3 bg-gray-700 rounded-lg space-y-3">
      <div className="text-sm text-white font-medium flex items-center gap-2">
        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
        <span>Spatial Condition</span>
      </div>

      <div>
        <label className="text-xs text-gray-400">Storey</label>
        <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
          {storeys.map(storey => (
            <button
              key={storey.name}
              onClick={() => setSelectedStorey(storey.name)}
              className={`w-full px-3 py-2 rounded text-left text-sm flex items-center justify-between ${
                selectedStorey === storey.name
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-600'
              }`}
            >
              <span>{storey.name}</span>
              <span className="text-gray-400 text-xs">
                {storey.elevation.toFixed(1)}m • {storey.elementCount} elements
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!selectedStorey}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Material Condition Editor
// ============================================================================

function MaterialConditionEditor({ onClose }: { onClose: () => void }) {
  const schema = useIfcStore(selectSchema);
  const addCondition = useRuleStore(state => state.addCondition);
  const materials = schema?.materials || [];

  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredMaterials = materials.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAdd = () => {
    if (!selectedMaterial) return;

    addCondition({
      type: 'material',
      name: selectedMaterial,
    });

    onClose();
  };

  return (
    <div className="p-3 bg-gray-700 rounded-lg space-y-3">
      <div className="text-sm text-white font-medium flex items-center gap-2">
        <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
        <span>Material Condition</span>
      </div>

      <div>
        <input
          type="text"
          placeholder="Search materials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-2 py-1.5 bg-gray-800 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-1 max-h-40 overflow-y-auto">
        {filteredMaterials.map(mat => (
          <button
            key={mat.name}
            onClick={() => setSelectedMaterial(mat.name)}
            className={`w-full px-3 py-2 rounded text-left text-sm flex items-center justify-between ${
              selectedMaterial === mat.name
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-200 hover:bg-gray-600'
            }`}
          >
            <span>{mat.name}</span>
            <span className="text-gray-400 text-xs">
              {mat.elementCount} elements
            </span>
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleAdd}
          disabled={!selectedMaterial}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Match Count Footer
// ============================================================================

function MatchCountFooter() {
  const matchCount = useRuleStore(selectMatchCount);
  const isEvaluating = useRuleStore(state => state.isEvaluating);
  const evaluationTime = useRuleStore(state => state.evaluationTime);
  const conditions = useRuleStore(selectConditions);
  const viewMode = useRuleStore(state => state.viewMode);
  const setViewMode = useRuleStore(state => state.setViewMode);
  const clearConditions = useRuleStore(state => state.clearConditions);

  const hasConditions = conditions.length > 0;

  return (
    <div className="px-4 py-3 border-t border-gray-700">
      {/* Match count */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isEvaluating ? (
            <>
              <svg className="animate-spin w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-gray-400 text-sm">Evaluating...</span>
            </>
          ) : hasConditions ? (
            <>
              <span className={matchCount > 0 ? 'text-green-400' : 'text-gray-400'}>
                {matchCount > 0 ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2" /></svg>
                )}
              </span>
              <span className={`text-sm ${matchCount > 0 ? 'text-white' : 'text-gray-400'}`}>
                {matchCount} elements matched
              </span>
              {evaluationTime > 0 && (
                <span className="text-gray-500 text-xs">
                  ({evaluationTime.toFixed(1)}ms)
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400 text-sm">Add conditions to select elements</span>
          )}
        </div>
      </div>

      {/* View mode buttons */}
      {hasConditions && matchCount > 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('highlight')}
            className={`flex-1 px-2 py-1.5 rounded text-sm ${
              viewMode === 'highlight'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Highlight
          </button>
          <button
            onClick={() => setViewMode('isolate')}
            className={`flex-1 px-2 py-1.5 rounded text-sm ${
              viewMode === 'isolate'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Isolate
          </button>
          <button
            onClick={() => setViewMode('hide')}
            className={`flex-1 px-2 py-1.5 rounded text-sm ${
              viewMode === 'hide'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Hide
          </button>
        </div>
      )}

      {/* Clear button */}
      {hasConditions && (
        <button
          onClick={clearConditions}
          className="w-full mt-2 px-2 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export default RuleBuilderPanel;
