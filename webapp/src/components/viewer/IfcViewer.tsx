/**
 * IFC Viewer - Full-screen 3D viewer with minimal chrome
 *
 * Features:
 * - WebGPU rendering via ifc-lite
 * - Drag-and-drop file loading
 * - Click to select elements
 * - Hover highlighting
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useIfcStore } from '../../stores/ifc-store';
import { useRuleStore } from '../../stores/rule-store';

interface IfcViewerProps {
  className?: string;
}

export function IfcViewer({ className = '' }: IfcViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    file,
    isLoading,
    loadError,
    viewer,
  } = useIfcStore();

  const {
    matchedIds,
    viewMode,
    dimNonMatched,
  } = useRuleStore();

  // ==========================================================================
  // Initialize Renderer
  // ==========================================================================

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize ifc-lite renderer here
    // const renderer = new Renderer(canvasRef.current);
    // useIfcStore.getState().setViewer(createViewerAdapter(renderer, []));

    return () => {
      // Cleanup renderer
    };
  }, []);

  // ==========================================================================
  // Update Highlights when matches change
  // ==========================================================================

  useEffect(() => {
    if (!viewer || matchedIds.length === 0) return;

    switch (viewMode) {
      case 'highlight':
        viewer.highlightMatched(matchedIds);
        break;
      case 'isolate':
        viewer.isolate(matchedIds);
        break;
      case 'hide':
        viewer.hideElements(matchedIds);
        break;
    }

    return () => {
      viewer.clearHighlights();
    };
  }, [viewer, matchedIds, viewMode, dimNonMatched]);

  // ==========================================================================
  // File Drop Handlers
  // ==========================================================================

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      useIfcStore.getState().setError('Please drop an IFC file');
      return;
    }

    // Load file
    await loadIfcFile(file);
  }, []);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div
      className={`relative w-full h-full bg-gray-900 ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* WebGPU Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ touchAction: 'none' }}
      />

      {/* Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 border-4 border-dashed border-blue-500 flex items-center justify-center">
          <div className="text-white text-2xl font-medium">
            Drop IFC file here
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-white text-lg flex items-center gap-3">
            <LoadingSpinner />
            Loading IFC file...
          </div>
        </div>
      )}

      {/* Error State */}
      {loadError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {loadError}
        </div>
      )}

      {/* Empty State */}
      {!file && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-6xl mb-4">📦</div>
            <div className="text-xl mb-2">Drop an IFC file here</div>
            <div className="text-sm">or click to browse</div>
          </div>
        </div>
      )}

      {/* File Info (minimal) */}
      {file && (
        <div className="absolute top-4 left-4 text-white/60 text-sm">
          {file.name}
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// Helper Components
// ==========================================================================

function LoadingSpinner() {
  return (
    <svg
      className="animate-spin h-6 w-6 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

// ==========================================================================
// File Loading (stub - would use ifc-lite parser)
// ==========================================================================

async function loadIfcFile(file: File): Promise<void> {
  const store = useIfcStore.getState();

  try {
    store.setLoading(true);
    store.setFile({
      name: file.name,
      size: file.size,
      loadedAt: new Date(),
    });

    // Read file buffer
    const buffer = await file.arrayBuffer();

    // Parse with ifc-lite
    // const parser = new IfcParser();
    // const result = await parser.parse(buffer);

    // Build element index
    // const index = await buildElementIndex(result, { ... });
    // store.setIndex(index);

    // Extract schema for autocomplete
    // const schema = extractIfcSchema(index);
    // store.setSchema(schema);

    console.log('File loaded:', file.name, file.size, 'bytes');

  } catch (error) {
    store.setError(error instanceof Error ? error.message : 'Failed to load file');
  }
}

export default IfcViewer;
