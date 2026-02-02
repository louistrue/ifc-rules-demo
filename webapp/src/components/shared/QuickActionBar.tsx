/**
 * QuickActionBar - Minimal bottom action bar
 *
 * Provides quick access to common actions without cluttering the 3D view.
 */

import React, { useRef } from 'react';
import { useIfcStore } from '../../stores/ifc-store';
import { useRuleStore } from '../../stores/rule-store';
import { loadIfcFileDemo } from '../../lib/ifc-loader';

export function QuickActionBar() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const file = useIfcStore(state => state.file);
  const isLoading = useIfcStore(state => state.isLoading);

  const isOpen = useRuleStore(state => state.isOpen);
  const isLibraryOpen = useRuleStore(state => state.isLibraryOpen);
  const togglePanel = useRuleStore(state => state.togglePanel);
  const toggleLibrary = useRuleStore(state => state.toggleLibrary);
  const matchCount = useRuleStore(state => state.matchCount);
  const savedRules = useRuleStore(state => state.savedRules);

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleLoadDemo = async () => {
    const DEMO_MODEL_URL = 'https://media.githubusercontent.com/media/louistrue/ifc-lite/main/tests/models/various/01_BIMcollab_Example_ARC.ifc';
    const DEMO_MODEL_NAME = '01_BIMcollab_Example_ARC.ifc';
    
    console.log('Loading demo model from GitHub...');
    const store = useIfcStore.getState();
    store.setLoading(true);
    store.setFile({
      name: DEMO_MODEL_NAME,
      size: 0,
      loadedAt: new Date(),
    });

    try {
      // Fetch the IFC file from GitHub
      console.log('Fetching:', DEMO_MODEL_URL);
      const response = await fetch(DEMO_MODEL_URL);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch demo model: ${response.status} ${response.statusText}`);
      }
      
      const buffer = await response.arrayBuffer();
      console.log('Demo model fetched, size:', buffer.byteLength);
      
      // Update file size now that we know it
      store.setFile({
        name: DEMO_MODEL_NAME,
        size: buffer.byteLength,
        loadedAt: new Date(),
      });
      
      // This will trigger the IfcViewer to parse and render
      store.setFileBuffer(buffer);
    } catch (error) {
      console.error('Failed to load demo model:', error);
      
      // Fallback to mock data if fetch fails
      console.log('Falling back to mock data...');
      try {
        const result = await loadIfcFileDemo(new ArrayBuffer(0));
        console.log('Mock data loaded:', result.stats);
        store.setIndex(result.index);
        store.setSchema(result.schema);
        store.setFile({
          name: 'demo-model.ifc (mock)',
          size: 0,
          loadedAt: new Date(),
        });
        store.setLoading(false);
      } catch (mockError) {
        store.setError('Failed to load demo: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    console.log('Loading file:', file.name);

    const store = useIfcStore.getState();
    store.setLoading(true);
    store.setFile({
      name: file.name,
      size: file.size,
      loadedAt: new Date(),
    });

    try {
      const buffer = await file.arrayBuffer();
      store.setFileBuffer(buffer);
    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Failed to load file');
    }
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
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

        {/* Demo Button */}
        {!file && (
          <button
            onClick={handleLoadDemo}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm text-yellow-300 hover:text-yellow-200 hover:bg-gray-700 transition-colors disabled:opacity-50"
            title="Load demo data for testing"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="hidden sm:inline">Demo</span>
          </button>
        )}

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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
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
          onClick={toggleLibrary}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
            isLibraryOpen
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
          title="Saved Rules"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="hidden sm:inline">Library</span>
          {savedRules.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${isLibraryOpen ? 'bg-blue-500' : 'bg-gray-600'}`}>
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
