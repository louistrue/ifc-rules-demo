# Rule Builder UI with 3D Viewer - Planning

## Goal

Create a **minimal, focused UI** for rule-based IFC selection with:
- Pure 3D viewer (no menus, no panels, no clutter)
- Smart rule builder that knows **what actually exists in the loaded file**
- **Instant visual feedback** - elements highlight as you build rules
- Autocomplete from real data (types, properties, storeys, materials, classifications)

---

## UX Design

### Layout: Full-Screen 3D + Floating Rule Builder

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                                                                 │
│                       3D VIEWER                                 │
│                    (Full Screen)                                │
│                                                                 │
│                                                                 │
│  ┌─────────────────────────────────────────┐                   │
│  │  🔍 Rule Builder                    ✕   │  ← Floating panel │
│  │  ────────────────────────────────────── │    (draggable)    │
│  │  Type: [IfcWall ▼]                      │                   │
│  │  + Add condition                        │                   │
│  │  ────────────────────────────────────── │                   │
│  │  ✓ 127 elements matched                 │                   │
│  └─────────────────────────────────────────┘                   │
│                                                                 │
│  [📁 Load IFC]  [💾 Save Rule]  [📋 Rules Library]             │
└─────────────────────────────────────────────────────────────────┘
```

### Interaction Flow

1. **Load IFC** → 3D appears, data is indexed
2. **Open Rule Builder** (Cmd+K or button)
3. **Build rule** with autocomplete from actual data
4. **See matches live** in 3D as you type
5. **Save rule** for reuse

---

## Data Discovery: What Exists in the File?

When an IFC file is loaded, we extract a **"schema"** of what's actually present:

```typescript
interface IfcFileSchema {
  // Entity types present in model
  entityTypes: Array<{
    type: string;           // "IfcWall"
    count: number;          // 127
    subtypes?: string[];    // ["IfcWallStandardCase"]
  }>;

  // Property sets and their properties
  propertySets: Array<{
    name: string;           // "Pset_WallCommon"
    appliesTo: string[];    // ["IfcWall", "IfcWallStandardCase"]
    properties: Array<{
      name: string;         // "IsExternal"
      valueType: string;    // "boolean" | "string" | "number"
      sampleValues: any[];  // [true, false]
      frequency: number;    // How many elements have this
    }>;
  }>;

  // Spatial structure
  spatial: {
    projects: string[];
    sites: string[];
    buildings: Array<{ name: string; storeys: string[] }>;
    storeys: Array<{
      name: string;
      elevation: number;
      elementCount: number;
    }>;
    spaces: Array<{ name: string; storey: string }>;
  };

  // Materials in model
  materials: Array<{
    name: string;
    type: 'single' | 'layerSet' | 'profileSet';
    elementCount: number;
  }>;

  // Classification systems
  classifications: Array<{
    system: string;         // "Uniclass 2015"
    codes: Array<{
      code: string;         // "Ss_25_10_30"
      name: string;         // "Concrete walls"
      elementCount: number;
    }>;
  }>;

  // Quantity sets
  quantitySets: Array<{
    name: string;           // "Qto_WallBaseQuantities"
    appliesTo: string[];
    quantities: Array<{
      name: string;         // "GrossVolume"
      unit: string;         // "m³"
      range: { min: number; max: number };
    }>;
  }>;
}
```

---

## Smart Rule Builder UI Components

### 1. Type Selector (with counts)

```
┌──────────────────────────────────────┐
│ Select Element Type           🔽     │
├──────────────────────────────────────┤
│ 🔍 Search types...                   │
├──────────────────────────────────────┤
│ ⬜ IfcWall                    (127)  │
│ ⬜ IfcWallStandardCase         (89)  │
│ ⬜ IfcDoor                     (45)  │
│ ⬜ IfcWindow                   (63)  │
│ ⬜ IfcSlab                     (12)  │
│ ⬜ IfcColumn                   (34)  │
│ ─────────────────────────────────── │
│ ☑️ Include subtypes                  │
└──────────────────────────────────────┘
```

### 2. Property Condition Builder

```
┌──────────────────────────────────────┐
│ Property Condition                   │
├──────────────────────────────────────┤
│ Property Set:                        │
│ [Pset_WallCommon ▼]                  │
│   📋 Only sets that apply to IfcWall │
├──────────────────────────────────────┤
│ Property:                            │
│ [IsExternal ▼]                       │
│   Values in model: true (89), false (38)
├──────────────────────────────────────┤
│ Condition:                           │
│ [equals ▼] [true ▼]                  │
│                                      │
│   💡 89 walls match this condition   │
└──────────────────────────────────────┘
```

### 3. Spatial Condition Builder

```
┌──────────────────────────────────────┐
│ Spatial Location                     │
├──────────────────────────────────────┤
│ Level:  [Storey ▼]                   │
├──────────────────────────────────────┤
│ Storey:                              │
│ ○ Ground Floor    (elev: 0.0m)  45   │
│ ○ Level 1         (elev: 3.5m)  52   │
│ ● Level 2         (elev: 7.0m)  30   │
│ ○ Roof            (elev: 10.5m) 12   │
├──────────────────────────────────────┤
│ Or by elevation:                     │
│ Between [0] and [4] meters           │
└──────────────────────────────────────┘
```

### 4. Material Condition Builder

```
┌──────────────────────────────────────┐
│ Material                             │
├──────────────────────────────────────┤
│ 🔍 Search materials...               │
├──────────────────────────────────────┤
│ ○ Concrete C30/37           (45)     │
│ ● Brick - Common            (32)     │
│ ○ Steel S355                (28)     │
│ ○ Insulation - Mineral Wool (67)     │
├──────────────────────────────────────┤
│ ☑️ Include in layer sets             │
│ Thickness: [    ] to [    ] mm       │
└──────────────────────────────────────┘
```

### 5. Classification Condition Builder

```
┌──────────────────────────────────────┐
│ Classification                       │
├──────────────────────────────────────┤
│ System: [Uniclass 2015 ▼]            │
│         [Omniclass      ]            │
├──────────────────────────────────────┤
│ Code:                                │
│ 🔍 Search codes...                   │
│ ○ Ss_25       Structural systems     │
│   ├─ Ss_25_10 Wall structures    (45)│
│   │  └─ Ss_25_10_30 Concrete     (32)│
│   └─ Ss_25_20 Column structures  (28)│
└──────────────────────────────────────┘
```

---

## Real-Time 3D Feedback

### Highlighting States

| State | Color | Opacity | Description |
|-------|-------|---------|-------------|
| **Matched** | Blue `#3B82F6` | 100% | Elements matching current rule |
| **Hovered** | Yellow `#EAB308` | 100% | Element under cursor |
| **Selected** | Orange `#F97316` | 100% | Clicked to inspect |
| **Dimmed** | Gray | 30% | Non-matching elements |
| **Hidden** | - | 0% | Filtered out completely |

### Live Update Flow

```
User types/selects in Rule Builder
           │
           ▼
    ┌──────────────────┐
    │  Debounce 100ms  │
    └──────────────────┘
           │
           ▼
    ┌──────────────────┐
    │  Evaluate Rule   │
    │  against Index   │
    └──────────────────┘
           │
           ▼
    ┌──────────────────┐
    │  Get ExpressIDs  │
    │  of matches      │
    └──────────────────┘
           │
           ▼
    ┌──────────────────┐
    │  Update Viewer   │
    │  - Highlight     │
    │  - Dim others    │
    │  - Update count  │
    └──────────────────┘
```

---

## Component Architecture

```
App
├── IfcViewer (full screen, WebGPU)
│   ├── Canvas (3D rendering)
│   ├── CameraControls (orbit, pan, zoom)
│   └── SelectionHighlighter
│
├── RuleBuilderPanel (floating, draggable)
│   ├── TypeSelector
│   ├── ConditionList
│   │   ├── PropertyCondition
│   │   ├── SpatialCondition
│   │   ├── MaterialCondition
│   │   └── ClassificationCondition
│   ├── MatchCounter
│   └── ActionButtons (save, clear, export)
│
├── QuickActions (bottom bar, minimal)
│   ├── LoadFileButton
│   ├── RulesLibraryButton
│   └── SettingsButton (⚙️)
│
└── Providers
    ├── IfcDataProvider (parsed data + index)
    ├── RuleEngineProvider (rule evaluation)
    └── ViewerProvider (3D viewer instance)
```

---

## State Management

```typescript
interface AppState {
  // File state
  file: {
    loaded: boolean;
    name: string;
    size: number;
  };

  // Parsed data (from ifc-lite)
  ifcData: {
    parseResult: ParseResult | null;
    index: ElementIndex | null;
    schema: IfcFileSchema | null;  // What exists in file
  };

  // Rule builder state
  ruleBuilder: {
    isOpen: boolean;
    currentRule: SelectionRule;
    conditions: Condition[];
    matchedIds: number[];
    matchCount: number;
    isEvaluating: boolean;
  };

  // Viewer state
  viewer: {
    highlightedIds: number[];
    hiddenIds: number[];
    selectedId: number | null;
    hoveredId: number | null;
  };

  // Saved rules
  savedRules: SelectionRule[];
}
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open rule builder |
| `Cmd/Ctrl + O` | Load IFC file |
| `Cmd/Ctrl + S` | Save current rule |
| `Escape` | Close rule builder / clear selection |
| `H` | Hide matched elements |
| `I` | Isolate matched elements |
| `R` | Reset view (show all) |
| `F` | Fit view to matched elements |

---

## File Structure

```
src/
├── components/
│   ├── viewer/
│   │   ├── IfcViewer.tsx           # Full-screen 3D viewer
│   │   ├── ViewerCanvas.tsx        # WebGPU canvas
│   │   ├── CameraControls.tsx      # Orbit/pan/zoom
│   │   └── SelectionOverlay.tsx    # Highlight rendering
│   │
│   ├── rule-builder/
│   │   ├── RuleBuilderPanel.tsx    # Main floating panel
│   │   ├── TypeSelector.tsx        # Entity type picker
│   │   ├── ConditionBuilder.tsx    # Add/edit conditions
│   │   ├── PropertyCondition.tsx   # Property condition UI
│   │   ├── SpatialCondition.tsx    # Storey/space selector
│   │   ├── MaterialCondition.tsx   # Material picker
│   │   ├── ClassificationCondition.tsx
│   │   ├── MatchCounter.tsx        # Live match count
│   │   └── ConditionChip.tsx       # Compact condition display
│   │
│   ├── shared/
│   │   ├── Autocomplete.tsx        # Smart autocomplete
│   │   ├── ChipInput.tsx           # Multi-value input
│   │   └── FloatingPanel.tsx       # Draggable container
│   │
│   └── quick-actions/
│       ├── QuickBar.tsx            # Bottom action bar
│       ├── LoadFileButton.tsx
│       └── RulesLibrary.tsx
│
├── hooks/
│   ├── useIfcParser.ts             # Parse IFC files
│   ├── useIfcSchema.ts             # Extract schema from loaded file
│   ├── useRuleEngine.ts            # Rule evaluation
│   ├── useViewerHighlight.ts       # Sync highlights to viewer
│   └── useLiveMatching.ts          # Debounced live evaluation
│
├── lib/
│   ├── schema-extractor.ts         # Extract IfcFileSchema
│   ├── viewer-adapter.ts           # ifc-lite viewer integration
│   └── rule-serializer.ts          # Save/load rules
│
├── stores/
│   ├── ifc-store.ts                # Zustand store for IFC data
│   └── rule-store.ts               # Rule builder state
│
└── App.tsx                         # Main app (minimal)
```

---

## Implementation Phases

### Phase 1: Minimal Viewer
- Full-screen 3D viewer with ifc-lite
- File drop/load
- Basic camera controls
- No UI chrome

### Phase 2: Data Discovery
- Extract schema from loaded file
- Index all property sets, materials, etc.
- Build lookup maps for autocomplete

### Phase 3: Rule Builder UI
- Floating panel with type selector
- Property condition with autocomplete
- Live match count

### Phase 4: 3D Integration
- Highlight matched elements
- Dim non-matched
- Isolate/hide controls
- Click to inspect

### Phase 5: Polish
- Save/load rules
- Keyboard shortcuts
- Rules library
- Export matched elements

---

## Quick Start Command

```bash
# Create new project with React viewer template
npx create-ifc-lite rule-builder-demo --template react

# Install rule engine
npm install @ifc-rules/core

# Add UI dependencies
npm install @radix-ui/react-popover @radix-ui/react-select \
            @radix-ui/react-dialog cmdk zustand

# Start dev server
npm run dev
```
