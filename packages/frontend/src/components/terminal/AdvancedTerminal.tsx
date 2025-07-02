import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import {
  Plus,
  X,
  Split,
  Maximize2,
  Minimize2,
  Search,
  Settings,
  Download,
  Upload,
  Copy,
  RotateCcw,
  Monitor,
} from 'lucide-react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useTerminal } from '../../hooks/useTerminal';
import 'xterm/css/xterm.css';

interface TerminalTab {
  id: string;
  title: string;
  sessionId: string;
  projectId: string;
  adapter: string;
  isActive: boolean;
  hasActivity: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
}

interface TerminalPane {
  id: string;
  tabId: string;
  position: { x: number; y: number; width: number; height: number };
  terminal: XTerm;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  terminalHook: any; // useTerminal hook instance
  isMaximized: boolean;
  connected: boolean;
}

interface SplitLayout {
  type: 'horizontal' | 'vertical';
  panes: TerminalPane[];
  ratio: number; // 0-1, split ratio
}

const AdvancedTerminal: React.FC = () => {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [panes, setPanes] = useState<TerminalPane[]>([]);
  const [splitLayout, setSplitLayout] = useState<SplitLayout | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const { socket, isConnected } = useWebSocket();

  // Function to initialize a terminal pane
  const initializeTerminalPane = useCallback(
    (pane: TerminalPane, tab: TerminalTab) => {
      // Mount terminal to DOM
      const container = document.getElementById(`terminal-${pane.id}`);
      if (container && pane.terminal) {
        pane.terminal.open(container);
        pane.fitAddon.fit();

        // Welcome message
        pane.terminal.writeln('🚀 Welcome to Vibe Code Terminal');
        pane.terminal.writeln(`Project: ${tab.projectId}`);
        pane.terminal.writeln(`Adapter: ${tab.adapter}`);
        pane.terminal.writeln('Connecting to AI coding assistant...');
        pane.terminal.writeln('');

        // Simulate connection for now (will be integrated with useTerminal later)
        setTimeout(() => {
          setPanes(prev =>
            prev.map(p => (p.id === pane.id ? { ...p, connected: true } : p))
          );
          setTabs(prev =>
            prev.map(t => (t.id === tab.id ? { ...t, status: 'connected' } : t))
          );
          pane.terminal.writeln(
            '✅ Connected! Ready to code with AI assistance.'
          );
          pane.terminal.write('\r\n$ ');
        }, 1000);

        // Handle user input (basic echo for now)
        pane.terminal.onData(data => {
          pane.terminal.write(data);
        });

        // Handle resize
        const handleResize = () => {
          pane.fitAddon.fit();
        };

        window.addEventListener('resize', handleResize);

        // Initial resize
        setTimeout(handleResize, 100);

        // Store cleanup function
        pane.terminal.onDispose(() => {
          window.removeEventListener('resize', handleResize);
        });
      }
    },
    []
  );

  // Terminal settings
  const [terminalSettings, setTerminalSettings] = useState({
    fontSize: 14,
    fontFamily:
      'Monaco, "Cascadia Code", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
    theme: 'dark',
    cursorBlink: true,
    scrollback: 1000,
    bellSound: false,
  });

  const themes = {
    dark: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#d4d4d4',
      selection: '#264f78',
      black: '#000000',
      red: '#f14c4c',
      green: '#23d18b',
      yellow: '#f5f543',
      blue: '#3b8eea',
      magenta: '#d670d6',
      cyan: '#29b8db',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#e5e5e5',
    },
    light: {
      background: '#ffffff',
      foreground: '#383a42',
      cursor: '#383a42',
      selection: '#e5e5e6',
      black: '#383a42',
      red: '#e45649',
      green: '#50a14f',
      yellow: '#c18401',
      blue: '#4078f2',
      magenta: '#a626a4',
      cyan: '#0184bc',
      white: '#fafafa',
      brightBlack: '#4f525e',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff',
    },
  };

  const createTerminal = useCallback(
    (
      tabId: string,
      projectId: string = 'default',
      adapter: string = 'claude-code'
    ): TerminalPane => {
      const terminal = new XTerm({
        fontSize: terminalSettings.fontSize,
        fontFamily: terminalSettings.fontFamily,
        theme: themes[terminalSettings.theme as keyof typeof themes],
        cursorBlink: terminalSettings.cursorBlink,
        scrollback: terminalSettings.scrollback,
        bellSound: terminalSettings.bellSound,
        allowTransparency: true,
        macOptionIsMeta: true,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      const searchAddon = new SearchAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.loadAddon(webLinksAddon);

      const paneId = `pane-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      return {
        id: paneId,
        tabId,
        position: { x: 0, y: 0, width: 100, height: 100 },
        terminal,
        fitAddon,
        searchAddon,
        terminalHook: null, // Will be set after creation
        isMaximized: false,
        connected: false,
      };
    },
    [terminalSettings]
  );

  const createNewTab = useCallback(
    async (projectId: string = 'default', adapter: string = 'claude-code') => {
      try {
        const tabId = `tab-${Date.now()}`;
        const sessionId = `session-${Date.now()}`;

        const newTab: TerminalTab = {
          id: tabId,
          title: `Terminal ${tabs.length + 1}`,
          sessionId,
          projectId,
          adapter,
          isActive: true,
          hasActivity: false,
          status: 'connecting',
        };

        setTabs(prev =>
          prev.map(tab => ({ ...tab, isActive: false })).concat(newTab)
        );
        setActiveTabId(tabId);

        // Create initial pane for the tab
        const pane = createTerminal(tabId, projectId, adapter);
        setPanes(prev => [...prev, pane]);

        // Initialize the terminal after a brief delay
        setTimeout(() => {
          initializeTerminalPane(pane, newTab);
        }, 100);
      } catch (error) {
        console.error('Failed to create new tab:', error);
      }
    },
    [tabs.length, createTerminal]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      // Clean up panes before removing
      const panesToCleanup = panes.filter(pane => pane.tabId === tabId);
      panesToCleanup.forEach(pane => {
        pane.terminal.dispose();
      });

      setTabs(prev => {
        const filtered = prev.filter(tab => tab.id !== tabId);
        if (filtered.length === 0) {
          setActiveTabId(null);
        } else if (activeTabId === tabId) {
          setActiveTabId(filtered[0].id);
        }
        return filtered;
      });

      // Remove associated panes
      setPanes(prev => prev.filter(pane => pane.tabId !== tabId));
    },
    [activeTabId, panes]
  );

  const splitPane = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      const activeTab = tabs.find(tab => tab.id === activeTabId);
      if (!activeTab) return;

      const currentPanes = panes.filter(pane => pane.tabId === activeTabId);
      if (currentPanes.length === 0) return;

      // Create new pane
      const newPane = createTerminal(
        activeTabId,
        activeTab.projectId,
        activeTab.adapter
      );

      // Update layout
      if (direction === 'horizontal') {
        // Split horizontally
        currentPanes.forEach((pane, index) => {
          pane.position.height = 50;
          if (index === 0) {
            pane.position.y = 0;
          }
        });
        newPane.position = { x: 0, y: 50, width: 100, height: 50 };
      } else {
        // Split vertically
        currentPanes.forEach((pane, index) => {
          pane.position.width = 50;
          if (index === 0) {
            pane.position.x = 0;
          }
        });
        newPane.position = { x: 50, y: 0, width: 50, height: 100 };
      }

      setPanes(prev => [...prev, newPane]);

      // Initialize the new pane
      setTimeout(() => {
        initializeTerminalPane(newPane, activeTab);
      }, 100);
    },
    [activeTabId, tabs, panes, createTerminal]
  );

  const closePane = useCallback(
    (paneId: string) => {
      const pane = panes.find(p => p.id === paneId);
      if (pane) {
        pane.terminal.dispose();
        setPanes(prev => prev.filter(p => p.id !== paneId));
      }
    },
    [panes]
  );

  const maximizePane = useCallback((paneId: string) => {
    setPanes(prev =>
      prev.map(pane => {
        if (pane.id === paneId) {
          if (pane.isMaximized) {
            // Restore original position
            return { ...pane, isMaximized: false };
          } else {
            // Maximize
            return {
              ...pane,
              isMaximized: true,
              position: { x: 0, y: 0, width: 100, height: 100 },
            };
          }
        }
        return pane;
      })
    );
  }, []);

  const searchInTerminal = useCallback(
    (query: string) => {
      const activePane = panes.find(
        pane => pane.tabId === activeTabId && !pane.isMaximized
      );

      if (activePane && query) {
        activePane.searchAddon.findNext(query);
      }
    },
    [activeTabId, panes]
  );

  const exportTerminalContent = useCallback(
    (format: 'txt' | 'html') => {
      const activePane = panes.find(pane => pane.tabId === activeTabId);
      if (!activePane) return;

      const content =
        format === 'html'
          ? activePane.terminal.getSelectionAsHTML() || 'No selection'
          : activePane.terminal.getSelection() ||
            activePane.terminal.buffer.active.getLine(0)?.translateToString() ||
            '';

      const blob = new Blob([content], {
        type: format === 'html' ? 'text/html' : 'text/plain',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `terminal-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [activeTabId, panes]
  );

  // Initialize with first tab
  useEffect(() => {
    if (tabs.length === 0) {
      createNewTab();
    }
  }, [tabs.length, createNewTab]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      panes.forEach(pane => {
        if (pane.fitAddon) {
          setTimeout(() => pane.fitAddon.fit(), 100);
        }
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [panes]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts if the terminal container has focus
      if (!terminalContainerRef.current?.contains(document.activeElement)) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            createNewTab();
            break;
          case 'w':
            e.preventDefault();
            if (activeTabId) {
              closeTab(activeTabId);
            }
            break;
          case '\\':
            e.preventDefault();
            splitPane('vertical');
            break;
          case '-':
            e.preventDefault();
            splitPane('horizontal');
            break;
          case 'f':
            e.preventDefault();
            setIsSearchOpen(!isSearchOpen);
            break;
        }
      }

      // Tab navigation with Ctrl+1-9
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (tabs[index]) {
          setActiveTabId(tabs[index].id);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, tabs, isSearchOpen, createNewTab, closeTab, splitPane]);

  const activeTabPanes = panes.filter(pane => pane.tabId === activeTabId);
  const maximizedPane = activeTabPanes.find(pane => pane.isMaximized);

  return (
    <div className='flex flex-col h-full bg-gray-900'>
      {/* Terminal Toolbar */}
      <div className='flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700'>
        <div className='flex items-center space-x-2'>
          {/* Tab Bar */}
          <div className='flex items-center space-x-1'>
            {tabs.map(tab => (
              <div
                key={tab.id}
                className={`flex items-center px-3 py-1 rounded-t-lg cursor-pointer transition-colors ${
                  tab.isActive
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-650'
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${
                    tab.status === 'connected'
                      ? 'bg-green-500'
                      : tab.status === 'connecting'
                        ? 'bg-yellow-500'
                        : tab.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-gray-500'
                  }`}
                />
                <span className='text-sm'>{tab.title}</span>
                {tab.hasActivity && !tab.isActive && (
                  <div className='w-2 h-2 bg-blue-500 rounded-full ml-2' />
                )}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className='ml-2 text-gray-400 hover:text-white'
                >
                  <X className='w-3 h-3' />
                </button>
              </div>
            ))}
            <button
              onClick={createNewTab}
              className='p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded'
            >
              <Plus className='w-4 h-4' />
            </button>
          </div>
        </div>

        {/* Terminal Controls */}
        <div className='flex items-center space-x-2'>
          <button
            onClick={() => splitPane('vertical')}
            className='p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded'
            title='Split Vertically'
          >
            <Split className='w-4 h-4 rotate-90' />
          </button>
          <button
            onClick={() => splitPane('horizontal')}
            className='p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded'
            title='Split Horizontally'
          >
            <Split className='w-4 h-4' />
          </button>
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className='p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded'
            title='Search'
          >
            <Search className='w-4 h-4' />
          </button>
          <button
            onClick={() => exportTerminalContent('txt')}
            className='p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded'
            title='Export as Text'
          >
            <Download className='w-4 h-4' />
          </button>
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className='p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded'
            title='Settings'
          >
            <Settings className='w-4 h-4' />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {isSearchOpen && (
        <div className='flex items-center px-4 py-2 bg-gray-750 border-b border-gray-700'>
          <Search className='w-4 h-4 text-gray-400 mr-2' />
          <input
            type='text'
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              searchInTerminal(e.target.value);
            }}
            placeholder='Search in terminal...'
            className='flex-1 bg-gray-600 text-white px-3 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
          />
          <button
            onClick={() => setIsSearchOpen(false)}
            className='ml-2 text-gray-400 hover:text-white'
          >
            <X className='w-4 h-4' />
          </button>
        </div>
      )}

      {/* Settings Panel */}
      {isSettingsOpen && (
        <div className='px-4 py-2 bg-gray-750 border-b border-gray-700'>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
            <div>
              <label className='block text-gray-300 mb-1'>Font Size</label>
              <select
                value={terminalSettings.fontSize}
                onChange={e =>
                  setTerminalSettings(prev => ({
                    ...prev,
                    fontSize: parseInt(e.target.value),
                  }))
                }
                className='w-full bg-gray-600 text-white px-2 py-1 rounded'
              >
                {[10, 12, 14, 16, 18, 20].map(size => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className='block text-gray-300 mb-1'>Theme</label>
              <select
                value={terminalSettings.theme}
                onChange={e =>
                  setTerminalSettings(prev => ({
                    ...prev,
                    theme: e.target.value,
                  }))
                }
                className='w-full bg-gray-600 text-white px-2 py-1 rounded'
              >
                <option value='dark'>Dark</option>
                <option value='light'>Light</option>
              </select>
            </div>
            <div>
              <label className='block text-gray-300 mb-1'>Scrollback</label>
              <select
                value={terminalSettings.scrollback}
                onChange={e =>
                  setTerminalSettings(prev => ({
                    ...prev,
                    scrollback: parseInt(e.target.value),
                  }))
                }
                className='w-full bg-gray-600 text-white px-2 py-1 rounded'
              >
                {[500, 1000, 2000, 5000].map(lines => (
                  <option key={lines} value={lines}>
                    {lines} lines
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className='flex items-center text-gray-300'>
                <input
                  type='checkbox'
                  checked={terminalSettings.cursorBlink}
                  onChange={e =>
                    setTerminalSettings(prev => ({
                      ...prev,
                      cursorBlink: e.target.checked,
                    }))
                  }
                  className='mr-2'
                />
                Cursor Blink
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Content Area */}
      <div className='flex-1 relative' ref={terminalContainerRef}>
        {activeTabPanes.map(pane => (
          <div
            key={pane.id}
            className={`absolute bg-black ${
              maximizedPane && maximizedPane.id !== pane.id ? 'hidden' : ''
            }`}
            style={{
              left: `${pane.position.x}%`,
              top: `${pane.position.y}%`,
              width: `${pane.position.width}%`,
              height: `${pane.position.height}%`,
            }}
          >
            {/* Pane Header */}
            <div className='flex items-center justify-between px-2 py-1 bg-gray-800 text-xs text-gray-300'>
              <div className='flex items-center space-x-2'>
                <div
                  className={`w-2 h-2 rounded-full ${
                    pane.connected ? 'bg-green-500' : 'bg-gray-500'
                  }`}
                />
                <span>Terminal {pane.id.split('-').pop()}</span>
              </div>
              <div className='flex items-center space-x-1'>
                <button
                  onClick={() => maximizePane(pane.id)}
                  className='text-gray-400 hover:text-white'
                  title={pane.isMaximized ? 'Restore' : 'Maximize'}
                >
                  {pane.isMaximized ? (
                    <Minimize2 className='w-3 h-3' />
                  ) : (
                    <Maximize2 className='w-3 h-3' />
                  )}
                </button>
                {activeTabPanes.length > 1 && (
                  <button
                    onClick={() => closePane(pane.id)}
                    className='text-gray-400 hover:text-red-400'
                    title='Close Pane'
                  >
                    <X className='w-3 h-3' />
                  </button>
                )}
              </div>
            </div>

            {/* Terminal Container */}
            <div
              id={`terminal-${pane.id}`}
              className='w-full h-full'
              style={{ height: 'calc(100% - 24px)' }}
            />
          </div>
        ))}

        {/* Empty State */}
        {activeTabPanes.length === 0 && (
          <div className='flex items-center justify-center h-full text-gray-500'>
            <div className='text-center'>
              <Monitor className='w-12 h-12 mx-auto mb-4' />
              <p>No terminal sessions active</p>
              <button
                onClick={createNewTab}
                className='mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700'
              >
                Create New Terminal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className='flex items-center justify-between px-4 py-1 bg-gray-800 border-t border-gray-700 text-xs text-gray-400'>
        <div className='flex items-center space-x-4'>
          <span>Tabs: {tabs.length}</span>
          <span>Panes: {activeTabPanes.length}</span>
          <span>
            Connected: {activeTabPanes.filter(p => p.connected).length}/
            {activeTabPanes.length}
          </span>
          {activeTabId && (
            <span>
              Active: {tabs.find(t => t.id === activeTabId)?.title || 'None'}
            </span>
          )}
        </div>
        <div className='flex items-center space-x-2'>
          <span>Font: {terminalSettings.fontSize}px</span>
          <span>Theme: {terminalSettings.theme}</span>
          <span>WebSocket: {isConnected ? '🟢' : '🔴'}</span>
        </div>
      </div>
    </div>
  );
};

export default AdvancedTerminal;
