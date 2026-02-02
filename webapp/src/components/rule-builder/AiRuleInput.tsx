/**
 * AI Rule Input - Natural language rule generation component
 */

import React, { useState } from 'react';
import { useAiRuleGenerator } from '../../hooks/useAiRuleGenerator';

const EXAMPLE_PROMPTS = [
  "all walls with 'Holz' in name on storey with 'EG' in name",
  "external doors",
  "concrete columns",
  "spaces larger than 50 square meters",
  "windows on the ground floor",
];

export function AiRuleInput() {
  const [prompt, setPrompt] = useState('');
  const [isExpanded, setIsExpanded] = useState(true); // Start expanded by default
  const [showExamples, setShowExamples] = useState(true); // Show examples by default
  const { generateRule, isGenerating, error } = useAiRuleGenerator();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;
    await generateRule(prompt);
    // Keep prompt for editing
  };

  const handleExampleClick = (example: string) => {
    setPrompt(example);
    // Keep examples visible - don't hide them
    generateRule(example);
  };

  return (
    <div className="border-b border-gray-700 pb-3 mb-3">
      {/* Header - Collapsible */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className="w-full flex items-center justify-between text-left py-2 hover:bg-gray-700/50 rounded px-2 -mx-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="text-sm font-medium text-gray-300">AI Rule Generator</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="space-y-2 mt-2">
          {/* Input Form */}
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to select..."
                disabled={isGenerating}
                className="w-full px-3 py-2 bg-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                onFocus={() => setShowExamples(true)}
              />
              {isGenerating && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="animate-spin w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Generate Rule</span>
                </>
              )}
            </button>
          </form>

          {/* Error Display */}
          {error && (
            <div className="px-3 py-2 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Example Prompts */}
          {showExamples && !isGenerating && (
            <div className="space-y-1">
              <div className="text-xs text-gray-400 px-1">Example prompts:</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {EXAMPLE_PROMPTS.map((example, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExampleClick(example);
                    }}
                    className="w-full text-left px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded transition-colors"
                  >
                    "{example}"
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
