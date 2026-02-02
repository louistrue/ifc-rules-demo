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

type ExtractionPhase =
  | 'idle'
  | 'parsing'
  | 'geometry'
  | 'properties'
  | 'materials'
  | 'classifications'
  | 'indexing'
  | 'complete';

interface ExtractionProgress {
  phase: ExtractionPhase;
  percent: number;
  message: string;
}

interface IfcStoreState {
  // File info
  file: IfcFile | null;
  fileBuffer: ArrayBuffer | null;
  isLoading: boolean;
  loadError: string | null;

  // Extraction progress
  extractionProgress: ExtractionProgress;
  isExtracting: boolean;

  // Parsed data
  parseResult: unknown | null;  // IfcParser result
  index: ElementIndex | null;
  schema: IfcFileSchema | null;
  allElementIds: number[];

  // Viewer
  viewer: ViewerAdapter | null;

  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setFile: (file: IfcFile) => void;
  setFileBuffer: (buffer: ArrayBuffer) => void;
  setParseResult: (result: unknown) => void;
  setExtractionProgress: (progress: ExtractionProgress) => void;
  setIsExtracting: (extracting: boolean) => void;
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
  fileBuffer: null,
  isLoading: false,
  loadError: null,
  extractionProgress: { phase: 'idle', percent: 0, message: '' },
  isExtracting: false,
  parseResult: null,
  index: null,
  schema: null,
  allElementIds: [],
  viewer: null,

  // Actions
  setLoading: (isLoading) => set({ isLoading, loadError: null }),

  setError: (loadError) => set({ loadError, isLoading: false, isExtracting: false }),

  setFile: (file) => set({ file }),

  setFileBuffer: (fileBuffer) => set({ fileBuffer }),

  setParseResult: (parseResult) => set({ parseResult }),

  setExtractionProgress: (extractionProgress) => set({ extractionProgress }),

  setIsExtracting: (isExtracting) => set({ isExtracting }),

  setIndex: (index) => set({
    index,
    allElementIds: Array.from(index.elements.keys()),
  }),

  setSchema: (schema) => set({ schema }),

  setViewer: (viewer) => set({ viewer }),

  reset: () => set({
    file: null,
    fileBuffer: null,
    isLoading: false,
    loadError: null,
    extractionProgress: { phase: 'idle', percent: 0, message: '' },
    isExtracting: false,
    parseResult: null,
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
export const selectIsExtracting = (state: IfcStoreState) => state.isExtracting;
export const selectExtractionProgress = (state: IfcStoreState) => state.extractionProgress;
export const selectParseResult = (state: IfcStoreState) => state.parseResult;
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
