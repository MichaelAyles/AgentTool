import { EventEmitter } from 'events';
import { FileDatabase } from './file-database';

export interface LayoutPane {
  id: string;
  terminalId?: string;
  type: 'terminal' | 'placeholder' | 'comparison';
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  comparison?: {
    leftTerminalId?: string;
    rightTerminalId?: string;
    syncScroll: boolean;
    showDifferences: boolean;
  };
}

export interface LayoutConfig {
  id: string;
  name: string;
  type: 'preset' | 'custom';
  orientation: 'horizontal' | 'vertical' | 'grid';
  panes: LayoutPane[];
  createdAt: Date;
  lastUsed: Date;
  isDefault?: boolean;
  uuid?: string; // User-specific layouts
}

export interface LayoutState {
  currentLayoutId: string;
  activePane: string;
  paneSizes: Map<string, { width: number; height: number }>;
  splitRatios: number[];
  isComparisonMode: boolean;
  comparisonPanes: string[];
  syncScrolling: boolean;
}

export class LayoutManager extends EventEmitter {
  private database: FileDatabase;
  private layouts: Map<string, LayoutConfig> = new Map();
  private userLayouts: Map<string, Map<string, LayoutConfig>> = new Map(); // uuid -> layoutId -> config
  private layoutStates: Map<string, LayoutState> = new Map(); // uuid -> state
  private presetLayouts: LayoutConfig[] = [];

  constructor(database: FileDatabase) {
    super();
    this.database = database;
    this.initializePresets();
    this.loadLayouts();
  }

  private initializePresets(): void {
    this.presetLayouts = [
      {
        id: 'single-pane',
        name: 'Single Pane',
        type: 'preset',
        orientation: 'horizontal',
        panes: [
          {
            id: 'main',
            type: 'terminal',
            x: 0,
            y: 0,
            width: 100,
            height: 100
          }
        ],
        createdAt: new Date(),
        lastUsed: new Date(),
        isDefault: true
      },
      {
        id: 'vertical-split',
        name: 'Vertical Split',
        type: 'preset',
        orientation: 'vertical',
        panes: [
          {
            id: 'left',
            type: 'terminal',
            x: 0,
            y: 0,
            width: 50,
            height: 100
          },
          {
            id: 'right',
            type: 'terminal',
            x: 50,
            y: 0,
            width: 50,
            height: 100
          }
        ],
        createdAt: new Date(),
        lastUsed: new Date()
      },
      {
        id: 'horizontal-split',
        name: 'Horizontal Split',
        type: 'preset',
        orientation: 'horizontal',
        panes: [
          {
            id: 'top',
            type: 'terminal',
            x: 0,
            y: 0,
            width: 100,
            height: 50
          },
          {
            id: 'bottom',
            type: 'terminal',
            x: 0,
            y: 50,
            width: 100,
            height: 50
          }
        ],
        createdAt: new Date(),
        lastUsed: new Date()
      },
      {
        id: 'three-pane-vertical',
        name: '3-Pane Vertical',
        type: 'preset',
        orientation: 'vertical',
        panes: [
          {
            id: 'left',
            type: 'terminal',
            x: 0,
            y: 0,
            width: 33.33,
            height: 100
          },
          {
            id: 'center',
            type: 'terminal',
            x: 33.33,
            y: 0,
            width: 33.33,
            height: 100
          },
          {
            id: 'right',
            type: 'terminal',
            x: 66.66,
            y: 0,
            width: 33.34,
            height: 100
          }
        ],
        createdAt: new Date(),
        lastUsed: new Date()
      },
      {
        id: 'four-pane-grid',
        name: '4-Pane Grid',
        type: 'preset',
        orientation: 'grid',
        panes: [
          {
            id: 'top-left',
            type: 'terminal',
            x: 0,
            y: 0,
            width: 50,
            height: 50
          },
          {
            id: 'top-right',
            type: 'terminal',
            x: 50,
            y: 0,
            width: 50,
            height: 50
          },
          {
            id: 'bottom-left',
            type: 'terminal',
            x: 0,
            y: 50,
            width: 50,
            height: 50
          },
          {
            id: 'bottom-right',
            type: 'terminal',
            x: 50,
            y: 50,
            width: 50,
            height: 50
          }
        ],
        createdAt: new Date(),
        lastUsed: new Date()
      },
      {
        id: 'comparison-view',
        name: 'Terminal Comparison',
        type: 'preset',
        orientation: 'horizontal',
        panes: [
          {
            id: 'comparison',
            type: 'comparison',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            comparison: {
              syncScroll: true,
              showDifferences: true
            }
          }
        ],
        createdAt: new Date(),
        lastUsed: new Date()
      }
    ];

    // Add presets to main layouts map
    this.presetLayouts.forEach(layout => {
      this.layouts.set(layout.id, layout);
    });
  }

  private loadLayouts(): void {
    try {
      const dbData = this.database.getData();
      if (dbData.layouts) {
        // Load user layouts
        for (const [uuid, userLayouts] of Object.entries(dbData.layouts)) {
          const layoutMap = new Map<string, LayoutConfig>();
          for (const [layoutId, layoutConfig] of Object.entries(userLayouts as any)) {
            layoutMap.set(layoutId, {
              ...(layoutConfig as any),
              createdAt: new Date((layoutConfig as any).createdAt),
              lastUsed: new Date((layoutConfig as any).lastUsed)
            } as LayoutConfig);
          }
          this.userLayouts.set(uuid, layoutMap);
        }
      }

      if (dbData.layoutStates) {
        // Load layout states
        for (const [uuid, state] of Object.entries(dbData.layoutStates)) {
          this.layoutStates.set(uuid, {
            ...(state as any),
            paneSizes: new Map(Object.entries((state as any).paneSizes || {}))
          } as LayoutState);
        }
      }
    } catch (error) {
      console.error('Error loading layouts:', error);
    }
  }

  private saveLayouts(): void {
    try {
      const dbData = this.database.getData();
      
      // Save user layouts
      const layoutsData: any = {};
      for (const [uuid, userLayouts] of this.userLayouts.entries()) {
        const userLayoutsData: any = {};
        for (const [layoutId, layoutConfig] of userLayouts.entries()) {
          userLayoutsData[layoutId] = layoutConfig;
        }
        layoutsData[uuid] = userLayoutsData;
      }

      // Save layout states
      const statesData: any = {};
      for (const [uuid, state] of this.layoutStates.entries()) {
        statesData[uuid] = {
          ...state,
          paneSizes: Object.fromEntries(state.paneSizes)
        };
      }

      this.database.setData({
        ...dbData,
        layouts: layoutsData,
        layoutStates: statesData
      });
    } catch (error) {
      console.error('Error saving layouts:', error);
    }
  }

  createLayout(uuid: string, name: string, config: Partial<LayoutConfig>): LayoutConfig {
    const layoutId = `layout_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const layout: LayoutConfig = {
      id: layoutId,
      name,
      type: 'custom',
      orientation: config.orientation || 'horizontal',
      panes: config.panes || [],
      createdAt: new Date(),
      lastUsed: new Date(),
      uuid
    };

    if (!this.userLayouts.has(uuid)) {
      this.userLayouts.set(uuid, new Map());
    }

    this.userLayouts.get(uuid)!.set(layoutId, layout);
    this.saveLayouts();
    
    this.emit('layoutCreated', uuid, layout);
    return layout;
  }

  getLayout(uuid: string, layoutId: string): LayoutConfig | undefined {
    // Check presets first
    if (this.layouts.has(layoutId)) {
      return this.layouts.get(layoutId);
    }

    // Check user layouts
    const userLayouts = this.userLayouts.get(uuid);
    if (userLayouts && userLayouts.has(layoutId)) {
      return userLayouts.get(layoutId);
    }

    return undefined;
  }

  getAllLayouts(uuid: string): LayoutConfig[] {
    const layouts: LayoutConfig[] = [];
    
    // Add presets
    layouts.push(...this.presetLayouts);
    
    // Add user layouts
    const userLayouts = this.userLayouts.get(uuid);
    if (userLayouts) {
      layouts.push(...Array.from(userLayouts.values()));
    }

    return layouts.sort((a, b) => {
      if (a.type === 'preset' && b.type === 'custom') return -1;
      if (a.type === 'custom' && b.type === 'preset') return 1;
      return b.lastUsed.getTime() - a.lastUsed.getTime();
    });
  }

  updateLayout(uuid: string, layoutId: string, updates: Partial<LayoutConfig>): boolean {
    const userLayouts = this.userLayouts.get(uuid);
    if (!userLayouts || !userLayouts.has(layoutId)) {
      return false;
    }

    const layout = userLayouts.get(layoutId)!;
    Object.assign(layout, updates, { lastUsed: new Date() });
    
    this.saveLayouts();
    this.emit('layoutUpdated', uuid, layout);
    return true;
  }

  deleteLayout(uuid: string, layoutId: string): boolean {
    const userLayouts = this.userLayouts.get(uuid);
    if (!userLayouts || !userLayouts.has(layoutId)) {
      return false;
    }

    const layout = userLayouts.get(layoutId)!;
    userLayouts.delete(layoutId);
    
    this.saveLayouts();
    this.emit('layoutDeleted', uuid, layout);
    return true;
  }

  setCurrentLayout(uuid: string, layoutId: string): boolean {
    const layout = this.getLayout(uuid, layoutId);
    if (!layout) {
      return false;
    }

    // Update layout state
    let state = this.layoutStates.get(uuid);
    if (!state) {
      state = {
        currentLayoutId: layoutId,
        activePane: layout.panes[0]?.id || 'main',
        paneSizes: new Map(),
        splitRatios: [],
        isComparisonMode: false,
        comparisonPanes: [],
        syncScrolling: false
      };
      this.layoutStates.set(uuid, state);
    } else {
      state.currentLayoutId = layoutId;
    }

    // Update layout's last used time
    if (layout.type === 'custom') {
      this.updateLayout(uuid, layoutId, { lastUsed: new Date() });
    }

    this.saveLayouts();
    this.emit('layoutChanged', uuid, layout, state);
    return true;
  }

  getCurrentLayout(uuid: string): LayoutConfig | undefined {
    const state = this.layoutStates.get(uuid);
    if (!state) {
      return this.getLayout(uuid, 'single-pane'); // Default layout
    }

    return this.getLayout(uuid, state.currentLayoutId);
  }

  getLayoutState(uuid: string): LayoutState | undefined {
    return this.layoutStates.get(uuid);
  }

  updateLayoutState(uuid: string, updates: Partial<LayoutState>): boolean {
    let state = this.layoutStates.get(uuid);
    if (!state) {
      state = {
        currentLayoutId: 'single-pane',
        activePane: 'main',
        paneSizes: new Map(),
        splitRatios: [],
        isComparisonMode: false,
        comparisonPanes: [],
        syncScrolling: false
      };
      this.layoutStates.set(uuid, state);
    }

    Object.assign(state, updates);
    this.saveLayouts();
    this.emit('layoutStateUpdated', uuid, state);
    return true;
  }

  updatePaneSize(uuid: string, paneId: string, width: number, height: number): boolean {
    const state = this.layoutStates.get(uuid);
    if (!state) {
      return false;
    }

    state.paneSizes.set(paneId, { width, height });
    this.saveLayouts();
    this.emit('paneSizeUpdated', uuid, paneId, width, height);
    return true;
  }

  setSplitRatios(uuid: string, ratios: number[]): boolean {
    const state = this.layoutStates.get(uuid);
    if (!state) {
      return false;
    }

    state.splitRatios = ratios;
    this.saveLayouts();
    this.emit('splitRatiosUpdated', uuid, ratios);
    return true;
  }

  setComparisonMode(uuid: string, enabled: boolean, panes: string[] = []): boolean {
    const state = this.layoutStates.get(uuid);
    if (!state) {
      return false;
    }

    state.isComparisonMode = enabled;
    state.comparisonPanes = panes;
    
    this.saveLayouts();
    this.emit('comparisonModeChanged', uuid, enabled, panes);
    return true;
  }

  setSyncScrolling(uuid: string, enabled: boolean): boolean {
    const state = this.layoutStates.get(uuid);
    if (!state) {
      return false;
    }

    state.syncScrolling = enabled;
    this.saveLayouts();
    this.emit('syncScrollingChanged', uuid, enabled);
    return true;
  }

  assignTerminalToPane(uuid: string, paneId: string, terminalId: string): boolean {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return false;
    }

    const pane = layout.panes.find(p => p.id === paneId);
    if (!pane) {
      return false;
    }

    pane.terminalId = terminalId;
    pane.type = 'terminal';

    if (layout.type === 'custom') {
      this.updateLayout(uuid, layout.id, { panes: layout.panes });
    }

    this.emit('terminalAssigned', uuid, paneId, terminalId);
    return true;
  }

  removeTerminalFromPane(uuid: string, paneId: string): boolean {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return false;
    }

    const pane = layout.panes.find(p => p.id === paneId);
    if (!pane) {
      return false;
    }

    const terminalId = pane.terminalId;
    pane.terminalId = undefined;
    pane.type = 'placeholder';

    if (layout.type === 'custom') {
      this.updateLayout(uuid, layout.id, { panes: layout.panes });
    }

    this.emit('terminalRemoved', uuid, paneId, terminalId);
    return true;
  }

  getAvailablePanes(uuid: string): LayoutPane[] {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return [];
    }

    return layout.panes.filter(pane => !pane.terminalId);
  }

  getTerminalPanes(uuid: string): LayoutPane[] {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return [];
    }

    return layout.panes.filter(pane => pane.terminalId);
  }

  setupComparison(uuid: string, paneId: string, leftTerminalId: string, rightTerminalId: string, syncScroll = true, showDifferences = true): boolean {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return false;
    }

    const pane = layout.panes.find(p => p.id === paneId);
    if (!pane || pane.type !== 'comparison') {
      return false;
    }

    pane.comparison = {
      leftTerminalId,
      rightTerminalId,
      syncScroll,
      showDifferences
    };

    if (layout.type === 'custom') {
      this.updateLayout(uuid, layout.id, { panes: layout.panes });
    }

    this.emit('comparisonSetup', uuid, paneId, leftTerminalId, rightTerminalId);
    return true;
  }

  updateComparisonSettings(uuid: string, paneId: string, settings: { syncScroll?: boolean; showDifferences?: boolean }): boolean {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return false;
    }

    const pane = layout.panes.find(p => p.id === paneId);
    if (!pane || pane.type !== 'comparison' || !pane.comparison) {
      return false;
    }

    Object.assign(pane.comparison, settings);

    if (layout.type === 'custom') {
      this.updateLayout(uuid, layout.id, { panes: layout.panes });
    }

    this.emit('comparisonSettingsUpdated', uuid, paneId, settings);
    return true;
  }

  splitPane(uuid: string, paneId: string, direction: 'horizontal' | 'vertical'): boolean {
    const layout = this.getCurrentLayout(uuid);
    if (!layout || layout.type !== 'custom') {
      return false;
    }

    const paneIndex = layout.panes.findIndex(p => p.id === paneId);
    if (paneIndex === -1) {
      return false;
    }

    const originalPane = layout.panes[paneIndex];
    const newPaneId = `${paneId}_split_${Date.now()}`;

    if (direction === 'horizontal') {
      // Split horizontally (side by side)
      const halfWidth = originalPane.width / 2;
      
      // Update original pane
      originalPane.width = halfWidth;
      
      // Create new pane
      const newPane: LayoutPane = {
        id: newPaneId,
        type: 'placeholder',
        x: originalPane.x + halfWidth,
        y: originalPane.y,
        width: halfWidth,
        height: originalPane.height
      };
      
      layout.panes.push(newPane);
    } else {
      // Split vertically (top and bottom)
      const halfHeight = originalPane.height / 2;
      
      // Update original pane
      originalPane.height = halfHeight;
      
      // Create new pane
      const newPane: LayoutPane = {
        id: newPaneId,
        type: 'placeholder',
        x: originalPane.x,
        y: originalPane.y + halfHeight,
        width: originalPane.width,
        height: halfHeight
      };
      
      layout.panes.push(newPane);
    }

    this.updateLayout(uuid, layout.id, { panes: layout.panes });
    this.emit('paneSplit', uuid, paneId, newPaneId, direction);
    return true;
  }

  mergePane(uuid: string, paneId: string, targetPaneId: string): boolean {
    const layout = this.getCurrentLayout(uuid);
    if (!layout || layout.type !== 'custom') {
      return false;
    }

    const paneIndex = layout.panes.findIndex(p => p.id === paneId);
    const targetPaneIndex = layout.panes.findIndex(p => p.id === targetPaneId);
    
    if (paneIndex === -1 || targetPaneIndex === -1) {
      return false;
    }

    const pane = layout.panes[paneIndex];
    const targetPane = layout.panes[targetPaneIndex];

    // Expand target pane to include the removed pane's area
    const newX = Math.min(pane.x, targetPane.x);
    const newY = Math.min(pane.y, targetPane.y);
    const newWidth = Math.max(pane.x + pane.width, targetPane.x + targetPane.width) - newX;
    const newHeight = Math.max(pane.y + pane.height, targetPane.y + targetPane.height) - newY;

    targetPane.x = newX;
    targetPane.y = newY;
    targetPane.width = newWidth;
    targetPane.height = newHeight;

    // Remove the merged pane
    layout.panes.splice(paneIndex, 1);

    this.updateLayout(uuid, layout.id, { panes: layout.panes });
    this.emit('paneMerged', uuid, paneId, targetPaneId);
    return true;
  }

  resizePane(uuid: string, paneId: string, newSize: { width: number; height: number }): boolean {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return false;
    }

    const pane = layout.panes.find(p => p.id === paneId);
    if (!pane) {
      return false;
    }

    // Validate new size doesn't exceed boundaries
    if (pane.x + newSize.width > 100 || pane.y + newSize.height > 100) {
      return false;
    }

    // Check for minimum/maximum constraints
    if (pane.minWidth && newSize.width < pane.minWidth) return false;
    if (pane.maxWidth && newSize.width > pane.maxWidth) return false;
    if (pane.minHeight && newSize.height < pane.minHeight) return false;
    if (pane.maxHeight && newSize.height > pane.maxHeight) return false;

    pane.width = newSize.width;
    pane.height = newSize.height;

    if (layout.type === 'custom') {
      this.updateLayout(uuid, layout.id, { panes: layout.panes });
    }

    this.updatePaneSize(uuid, paneId, newSize.width, newSize.height);
    return true;
  }

  cleanupTerminalAssignments(uuid: string, activeTerminalIds: string[]): void {
    const layout = this.getCurrentLayout(uuid);
    if (!layout) {
      return;
    }

    let changed = false;
    layout.panes.forEach(pane => {
      if (pane.terminalId && !activeTerminalIds.includes(pane.terminalId)) {
        pane.terminalId = undefined;
        pane.type = 'placeholder';
        changed = true;
      }
      
      // Also clean up comparison panes
      if (pane.type === 'comparison' && pane.comparison) {
        if (pane.comparison.leftTerminalId && !activeTerminalIds.includes(pane.comparison.leftTerminalId)) {
          pane.comparison.leftTerminalId = undefined;
          changed = true;
        }
        if (pane.comparison.rightTerminalId && !activeTerminalIds.includes(pane.comparison.rightTerminalId)) {
          pane.comparison.rightTerminalId = undefined;
          changed = true;
        }
      }
    });

    if (changed && layout.type === 'custom') {
      this.updateLayout(uuid, layout.id, { panes: layout.panes });
    }
  }

  getLayoutStatistics(uuid: string): {
    totalLayouts: number;
    customLayouts: number;
    presetLayouts: number;
    currentLayout: string;
    lastUsed: Date | null;
  } {
    const allLayouts = this.getAllLayouts(uuid);
    const customLayouts = allLayouts.filter(l => l.type === 'custom');
    const currentLayout = this.getCurrentLayout(uuid);
    
    return {
      totalLayouts: allLayouts.length,
      customLayouts: customLayouts.length,
      presetLayouts: this.presetLayouts.length,
      currentLayout: currentLayout?.name || 'Unknown',
      lastUsed: currentLayout?.lastUsed || null
    };
  }

  exportLayout(uuid: string, layoutId: string): string | null {
    const layout = this.getLayout(uuid, layoutId);
    if (!layout) {
      return null;
    }

    return JSON.stringify(layout, null, 2);
  }

  importLayout(uuid: string, layoutData: string): LayoutConfig | null {
    try {
      const layout = JSON.parse(layoutData) as LayoutConfig;
      
      // Validate layout structure
      if (!layout.name || !layout.panes || !Array.isArray(layout.panes)) {
        throw new Error('Invalid layout structure');
      }

      // Generate new ID and update metadata
      const newLayout = {
        ...layout,
        id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: 'custom' as const,
        createdAt: new Date(),
        lastUsed: new Date(),
        uuid
      };

      if (!this.userLayouts.has(uuid)) {
        this.userLayouts.set(uuid, new Map());
      }

      this.userLayouts.get(uuid)!.set(newLayout.id, newLayout);
      this.saveLayouts();
      
      this.emit('layoutImported', uuid, newLayout);
      return newLayout;
    } catch (error) {
      console.error('Error importing layout:', error);
      return null;
    }
  }

  destroy(): void {
    this.saveLayouts();
    this.layouts.clear();
    this.userLayouts.clear();
    this.layoutStates.clear();
    this.removeAllListeners();
  }
}