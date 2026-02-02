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
import { Renderer } from '@ifc-lite/renderer';
import type { RenderOptions } from '@ifc-lite/renderer';
import { createPlatformBridge } from '@ifc-lite/geometry';
import { useIfcStore } from '../../stores/ifc-store';
import { useRuleStore } from '../../stores/rule-store';
import { loadIfcFile } from '../../lib/ifc-loader';

interface IfcViewerProps {
  className?: string;
}

export function IfcViewer({ className = '' }: IfcViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    file,
    fileBuffer,
    isLoading,
    loadError,
  } = useIfcStore();

  const {
    matchedIds,
    viewMode,
  } = useRuleStore();

  const rendererRef = useRef<Renderer | null>(null);
  const renderOptionsRef = useRef<RenderOptions>({});

  // ==========================================================================
  // Initialize Renderer
  // ==========================================================================

  useEffect(() => {
    if (!canvasRef.current) return;

    const initRenderer = async () => {
      try {
        const renderer = new Renderer(canvasRef.current!);
        await renderer.init();
        rendererRef.current = renderer;
        console.log('Renderer initialized');
      } catch (error) {
        console.error('Failed to initialize renderer:', error);
        useIfcStore.getState().setError('WebGPU not supported or failed to initialize');
      }
    };

    initRenderer();

    return () => {
      // Cleanup renderer if it has a destroy/dispose method
      (rendererRef.current as { destroy?: () => void })?.destroy?.();
      rendererRef.current = null;
    };
  }, []);

  // ==========================================================================
  // Parse IFC when fileBuffer changes
  // ==========================================================================

  useEffect(() => {
    if (!fileBuffer || !rendererRef.current) return;

    const parseAndRender = async () => {
      const store = useIfcStore.getState();
      const renderer = rendererRef.current;
      
      try {
        // Start geometry streaming in parallel with data extraction
        const geometryPromise = (async () => {
          console.log('Processing geometry...');
          const bridge = await createPlatformBridge();
          await bridge.init();
          
          const decoder = new TextDecoder('utf-8');
          const ifcContent = decoder.decode(fileBuffer);
          
          await bridge.processGeometryStreaming(ifcContent, {
            onBatch: (batch) => {
              renderer?.addMeshes(batch.meshes, true);
              renderer?.render({ isStreaming: true, ...renderOptionsRef.current });
              console.log(`Loaded batch: ${batch.meshes.length} meshes`);
            },
            onComplete: (stats) => {
              console.log('Geometry complete:', stats);
              renderer?.fitToView();
              // Final render with full quality
              renderer?.render(renderOptionsRef.current);
            },
            onError: (error) => {
              console.error('Geometry processing error:', error);
            },
          });
        })();

        // Extract properties, materials, classifications for rule evaluation
        const dataPromise = (async () => {
          console.log('Extracting IFC data for rules...');
          store.setIsExtracting(true);
          
          const result = await loadIfcFile(fileBuffer, (progress) => {
            store.setExtractionProgress(progress);
            console.log(`[${progress.phase}] ${progress.percent}% - ${progress.message}`);
          });
          
          console.log('Data extraction complete:', result.stats);
          store.setIndex(result.index);
          store.setSchema(result.schema);
          store.setIsExtracting(false);
        })();

        // Wait for both to complete
        await Promise.all([geometryPromise, dataPromise]);
        store.setLoading(false);
        
      } catch (error) {
        console.error('Parse/render error:', error);
        store.setError(
          error instanceof Error ? error.message : 'Failed to parse IFC file'
        );
      }
    };

    parseAndRender();
  }, [fileBuffer]);

  // ==========================================================================
  // Update view mode (highlight/isolate/hide) when matches change
  // ==========================================================================

  useEffect(() => {
    if (!rendererRef.current) return;

    const matchedSet = new Set(matchedIds);

    // Build render options based on view mode
    switch (viewMode) {
      case 'none':
        // None: show everything normally, no effects
        renderOptionsRef.current = {
          selectedIds: undefined,
          hiddenIds: undefined,
          isolatedIds: null,
        };
        break;

      case 'highlight':
        // Highlight: show all, but mark matched as selected
        renderOptionsRef.current = {
          selectedIds: matchedSet,
          hiddenIds: undefined,
          isolatedIds: null,
        };
        break;

      case 'isolate':
        // Isolate: only show matched elements
        if (matchedIds.length > 0) {
          renderOptionsRef.current = {
            selectedIds: matchedSet,
            hiddenIds: undefined,
            isolatedIds: matchedSet,
          };
        } else {
          renderOptionsRef.current = {
            selectedIds: undefined,
            hiddenIds: undefined,
            isolatedIds: null,
          };
        }
        break;

      case 'hide':
        // Hide: hide the matched elements
        renderOptionsRef.current = {
          selectedIds: undefined,
          hiddenIds: matchedSet,
          isolatedIds: null,
        };
        break;
    }

    // Trigger a re-render with new options immediately
    rendererRef.current.render(renderOptionsRef.current);
    
    console.log(`View mode: ${viewMode}, matched: ${matchedIds.length}`);

  }, [matchedIds, viewMode]); // Only depend on matchedIds and viewMode for immediate updates

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

    const droppedFile = files[0];
    if (!droppedFile.name.toLowerCase().endsWith('.ifc')) {
      useIfcStore.getState().setError('Please drop an IFC file');
      return;
    }

    // Load file
    const store = useIfcStore.getState();
    store.setLoading(true);
    store.setFile({
      name: droppedFile.name,
      size: droppedFile.size,
      loadedAt: new Date(),
    });

    try {
      const buffer = await droppedFile.arrayBuffer();
      store.setFileBuffer(buffer);
    } catch (error) {
      store.setError(error instanceof Error ? error.message : 'Failed to load file');
    }
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
            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
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

export default IfcViewer;
