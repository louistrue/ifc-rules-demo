/**
 * Viewer Adapter - Connects to ifc-lite renderer for highlighting and selection
 *
 * This module provides a clean interface between the rule engine and the 3D viewer,
 * handling element highlighting, visibility, colors, and selection feedback.
 */

// ============================================================================
// Types
// ============================================================================

export interface HighlightOptions {
  color?: number;         // Hex color (e.g., 0x3B82F6)
  opacity?: number;       // 0-1
  pulse?: boolean;        // Animate highlight
}

export interface ViewerState {
  highlightedIds: Set<number>;
  hiddenIds: Set<number>;
  isolatedIds: Set<number> | null;  // null = show all
  selectedId: number | null;
  hoveredId: number | null;
  colors: Map<number, number>;      // expressId -> color
}

export interface ViewerCallbacks {
  onElementClick?: (expressId: number) => void;
  onElementHover?: (expressId: number | null) => void;
  onBackgroundClick?: () => void;
}

// ============================================================================
// Color Constants
// ============================================================================

export const HIGHLIGHT_COLORS = {
  matched: 0x3B82F6,    // Blue - elements matching current rule
  hovered: 0xEAB308,    // Yellow - element under cursor
  selected: 0xF97316,   // Orange - clicked element
  hidden: 0x000000,     // Not visible
  dimmed: 0x6B7280,     // Gray - non-matching elements
  error: 0xEF4444,      // Red - validation errors
  success: 0x22C55E,    // Green - validation passed
} as const;

export const HIGHLIGHT_OPACITY = {
  matched: 1.0,
  dimmed: 0.3,
  hidden: 0.0,
} as const;

// ============================================================================
// Viewer Adapter Class
// ============================================================================

/**
 * ViewerAdapter wraps ifc-lite's renderer to provide a clean API
 * for rule-based highlighting and selection feedback.
 */
export class ViewerAdapter {
  private renderer: unknown;  // ifc-lite Renderer instance
  private state: ViewerState;
  private _callbacks: ViewerCallbacks;
  private allElementIds: Set<number>;

  constructor(renderer: unknown, allElementIds: number[]) {
    this.renderer = renderer;
    this.allElementIds = new Set(allElementIds);
    this._callbacks = {};

    this.state = {
      highlightedIds: new Set(),
      hiddenIds: new Set(),
      isolatedIds: null,
      selectedId: null,
      hoveredId: null,
      colors: new Map(),
    };
  }

  // ==========================================================================
  // Callbacks
  // ==========================================================================

  setCallbacks(callbacks: ViewerCallbacks): void {
    this._callbacks = callbacks;
  }

  getCallbacks(): ViewerCallbacks {
    return this._callbacks;
  }

  // ==========================================================================
  // Highlighting
  // ==========================================================================

  /**
   * Highlight elements that match a rule
   */
  highlightMatched(expressIds: number[], options: HighlightOptions = {}): void {
    const color = options.color ?? HIGHLIGHT_COLORS.matched;

    this.state.highlightedIds = new Set(expressIds);

    // Apply highlight color to matched elements
    this.applyColors(expressIds, color);

    // Dim non-matched elements
    const nonMatched = this.getNonMatched(expressIds);
    this.applyOpacity(nonMatched, HIGHLIGHT_OPACITY.dimmed);
    this.applyOpacity(expressIds, HIGHLIGHT_OPACITY.matched);
  }

  /**
   * Clear all highlights and restore normal view
   */
  clearHighlights(): void {
    this.state.highlightedIds.clear();
    this.state.colors.clear();

    // Restore all elements to full opacity
    this.applyOpacity(Array.from(this.allElementIds), 1.0);

    this.render();
  }

  /**
   * Set color for specific elements
   */
  setElementColors(expressIds: number[], color: number): void {
    for (const id of expressIds) {
      this.state.colors.set(id, color);
    }
    this.applyColors(expressIds, color);
  }

  /**
   * Remove color override for elements
   */
  clearElementColors(expressIds: number[]): void {
    for (const id of expressIds) {
      this.state.colors.delete(id);
    }
    this.render();
  }

  // ==========================================================================
  // Visibility
  // ==========================================================================

  /**
   * Hide specific elements
   */
  hideElements(expressIds: number[]): void {
    for (const id of expressIds) {
      this.state.hiddenIds.add(id);
    }
    this.applyVisibility(expressIds, false);
  }

  /**
   * Show hidden elements
   */
  showElements(expressIds: number[]): void {
    for (const id of expressIds) {
      this.state.hiddenIds.delete(id);
    }
    this.applyVisibility(expressIds, true);
  }

  /**
   * Show all elements
   */
  showAll(): void {
    this.state.hiddenIds.clear();
    this.state.isolatedIds = null;
    this.applyVisibility(Array.from(this.allElementIds), true);
  }

  /**
   * Isolate elements (hide everything else)
   */
  isolate(expressIds: number[]): void {
    this.state.isolatedIds = new Set(expressIds);

    // Hide non-isolated elements
    const toHide = this.getNonMatched(expressIds);
    this.applyVisibility(toHide, false);
    this.applyVisibility(expressIds, true);
  }

  /**
   * Toggle visibility of matched elements
   */
  toggleMatchedVisibility(expressIds: number[], visible: boolean): void {
    if (visible) {
      this.showElements(expressIds);
    } else {
      this.hideElements(expressIds);
    }
  }

  // ==========================================================================
  // Selection
  // ==========================================================================

  /**
   * Set selected element (from click)
   */
  setSelected(expressId: number | null): void {
    // Clear previous selection highlight
    if (this.state.selectedId !== null) {
      this.clearElementColors([this.state.selectedId]);
    }

    this.state.selectedId = expressId;

    // Apply selection highlight
    if (expressId !== null) {
      this.setElementColors([expressId], HIGHLIGHT_COLORS.selected);
    }
  }

  /**
   * Set hovered element
   */
  setHovered(expressId: number | null): void {
    // Clear previous hover
    if (this.state.hoveredId !== null && this.state.hoveredId !== this.state.selectedId) {
      // Restore to matched or default color
      if (this.state.highlightedIds.has(this.state.hoveredId)) {
        this.setElementColors([this.state.hoveredId], HIGHLIGHT_COLORS.matched);
      } else {
        this.clearElementColors([this.state.hoveredId]);
      }
    }

    this.state.hoveredId = expressId;

    // Apply hover highlight (if not selected)
    if (expressId !== null && expressId !== this.state.selectedId) {
      this.setElementColors([expressId], HIGHLIGHT_COLORS.hovered);
    }
  }

  // ==========================================================================
  // Camera
  // ==========================================================================

  /**
   * Fit view to specific elements
   */
  fitToElements(expressIds: number[]): void {
    // Call renderer's fitToElements method
    (this.renderer as { fitToElements?: (ids: number[]) => void })
      .fitToElements?.(expressIds);
  }

  /**
   * Fit view to all visible elements
   */
  fitToView(): void {
    const visible = Array.from(this.allElementIds)
      .filter(id => !this.state.hiddenIds.has(id));
    this.fitToElements(visible);
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  getState(): Readonly<ViewerState> {
    return this.state;
  }

  isHighlighted(expressId: number): boolean {
    return this.state.highlightedIds.has(expressId);
  }

  isHidden(expressId: number): boolean {
    return this.state.hiddenIds.has(expressId);
  }

  isSelected(expressId: number): boolean {
    return this.state.selectedId === expressId;
  }

  // ==========================================================================
  // Internal Methods
  // ==========================================================================

  private getNonMatched(matchedIds: number[]): number[] {
    const matchedSet = new Set(matchedIds);
    return Array.from(this.allElementIds).filter(id => !matchedSet.has(id));
  }

  private applyColors(expressIds: number[], color: number): void {
    // Call renderer's setColor method
    const renderer = this.renderer as {
      setColor?: (ids: number[], color: number) => void;
      setElementColor?: (ids: number[], r: number, g: number, b: number) => void;
    };

    if (renderer.setColor) {
      renderer.setColor(expressIds, color);
    } else if (renderer.setElementColor) {
      // Convert hex to RGB
      const r = ((color >> 16) & 0xFF) / 255;
      const g = ((color >> 8) & 0xFF) / 255;
      const b = (color & 0xFF) / 255;
      renderer.setElementColor(expressIds, r, g, b);
    }

    this.render();
  }

  private applyOpacity(expressIds: number[], opacity: number): void {
    // Call renderer's setOpacity method
    const renderer = this.renderer as {
      setOpacity?: (ids: number[], opacity: number) => void;
      setElementOpacity?: (ids: number[], opacity: number) => void;
    };

    if (renderer.setOpacity) {
      renderer.setOpacity(expressIds, opacity);
    } else if (renderer.setElementOpacity) {
      renderer.setElementOpacity(expressIds, opacity);
    }

    this.render();
  }

  private applyVisibility(expressIds: number[], visible: boolean): void {
    // Call renderer's setVisibility method
    const renderer = this.renderer as {
      setVisibility?: (ids: number[], visible: boolean) => void;
      showElements?: (ids: number[]) => void;
      hideElements?: (ids: number[]) => void;
    };

    if (renderer.setVisibility) {
      renderer.setVisibility(expressIds, visible);
    } else if (visible && renderer.showElements) {
      renderer.showElements(expressIds);
    } else if (!visible && renderer.hideElements) {
      renderer.hideElements(expressIds);
    }

    this.render();
  }

  private render(): void {
    // Trigger re-render
    const renderer = this.renderer as { render?: () => void };
    renderer.render?.();
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Create a viewer adapter instance
 */
export function createViewerAdapter(
  renderer: unknown,
  allElementIds: number[]
): ViewerAdapter {
  return new ViewerAdapter(renderer, allElementIds);
}
