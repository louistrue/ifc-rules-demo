/**
 * IFC Store - Global state for loaded IFC data
 *
 * Uses Zustand for simple, performant state management
 */

import { create } from 'zustand';
import type { ElementIndex } from '../../../src/core/types';
import type { IfcFileSchema } from '../lib/schema-extractor';
import type { ViewerAdapter } from '../lib/viewer-adapter';

// ============================================================================
// Types
// ============================================================================

interface IfcFile {
  name: string;
  size: number;
  loadedAt: Date;
}

interface IfcStoreState {
  // File info
  file: IfcFile | null;
  isLoading: boolean;
  loadError: string | null;

  // Parsed data
  index: ElementIndex | null;
  schema: IfcFileSchema | null;
  allElementIds: number[];

  // Viewer
  viewer: ViewerAdapter | null;

  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFile: (file: IfcFile) => void;
  setIndex: (index: ElementIndex) => void;
  setSchema: (schema: IfcFileSchema) => void;
  setViewer: (viewer: ViewerAdapter) => void;
  reset: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useIfcStore = create<IfcStoreState>((set) => ({
  // Initial state
  file: null,
  isLoading: false,
  loadError: null,
  index: null,
  schema: null,
  allElementIds: [],
  viewer: null,

  // Actions
  setLoading: (isLoading) => set({ isLoading, loadError: null }),

  setError: (loadError) => set({ loadError, isLoading: false }),

  setFile: (file) => set({ file }),

  setIndex: (index) => set({
    index,
    allElementIds: Array.from(index.elements.keys()),
  }),

  setSchema: (schema) => set({ schema }),

  setViewer: (viewer) => set({ viewer }),

  reset: () => set({
    file: null,
    isLoading: false,
    loadError: null,
    index: null,
    schema: null,
    allElementIds: [],
    viewer: null,
  }),
}));

// ============================================================================
// Selectors
// ============================================================================

export const selectFile = (state: IfcStoreState) => state.file;
export const selectIsLoading = (state: IfcStoreState) => state.isLoading;
export const selectIndex = (state: IfcStoreState) => state.index;
export const selectSchema = (state: IfcStoreState) => state.schema;
export const selectViewer = (state: IfcStoreState) => state.viewer;
export const selectAllElementIds = (state: IfcStoreState) => state.allElementIds;

// Derived selectors
export const selectEntityTypes = (state: IfcStoreState) =>
  state.schema?.entityTypes ?? [];

export const selectPropertySets = (state: IfcStoreState) =>
  state.schema?.propertySets ?? [];

export const selectStoreys = (state: IfcStoreState) =>
  state.schema?.spatial.storeys ?? [];

export const selectMaterials = (state: IfcStoreState) =>
  state.schema?.materials ?? [];

export const selectClassifications = (state: IfcStoreState) =>
  state.schema?.classifications ?? [];
