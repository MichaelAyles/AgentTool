import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
// Note: immer middleware needs to be added separately
// import { immer } from 'zustand/middleware/immer';
import type { Project, Session } from '@vibecode/shared';

interface AppState {
  // Projects
  projects: Project[];
  selectedProject: Project | null;
  
  // Sessions
  sessions: Record<string, Session>;
  activeSession: string | null;
  
  // Terminal
  terminals: Record<string, {
    id: string;
    projectId: string;
    adapter: string;
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    lastActivity: Date;
  }>;
  
  // UI State
  ui: {
    sidebarOpen: boolean;
    theme: 'light' | 'dark' | 'system';
    notifications: Array<{
      id: string;
      type: 'info' | 'success' | 'warning' | 'error';
      message: string;
      timestamp: Date;
      autoHide?: boolean;
    }>;
  };
  
  // Settings
  settings: {
    dangerousMode: boolean;
    autoSave: boolean;
    defaultAdapter: string;
    terminalSettings: {
      fontSize: number;
      fontFamily: string;
      theme: string;
      cursorBlink: boolean;
    };
  };
}

interface AppActions {
  // Project actions
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  selectProject: (project: Project | null) => void;
  
  // Session actions
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  
  // Terminal actions
  addTerminal: (terminal: AppState['terminals'][string]) => void;
  updateTerminal: (id: string, updates: Partial<AppState['terminals'][string]>) => void;
  removeTerminal: (id: string) => void;
  
  // UI actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: AppState['ui']['theme']) => void;
  addNotification: (notification: Omit<AppState['ui']['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  
  // Settings actions
  updateSettings: (updates: Partial<AppState['settings']>) => void;
  updateTerminalSettings: (updates: Partial<AppState['settings']['terminalSettings']>) => void;
  toggleDangerousMode: () => void;
  
  // Utility actions
  reset: () => void;
}

type AppStore = AppState & AppActions;

const initialState: AppState = {
  projects: [],
  selectedProject: null,
  sessions: {},
  activeSession: null,
  terminals: {},
  ui: {
    sidebarOpen: true,
    theme: 'system',
    notifications: [],
  },
  settings: {
    dangerousMode: false,
    autoSave: true,
    defaultAdapter: 'claude-code',
    terminalSettings: {
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
      theme: 'dark',
      cursorBlink: true,
    },
  },
};

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        // Project actions
        setProjects: (projects) => set({ projects }),
        
        addProject: (project) => set((state) => ({ 
          projects: [project, ...state.projects] 
        })),
        
        updateProject: (id, updates) => set((state) => ({
          projects: state.projects.map(p => 
            p.id === id ? { ...p, ...updates } : p
          )
        })),
        
        removeProject: (id) => set((state) => ({
          projects: state.projects.filter(p => p.id !== id),
          selectedProject: state.selectedProject?.id === id ? null : state.selectedProject,
        })),
        
        selectProject: (project) => set({ selectedProject: project }),
        
        // Session actions
        addSession: (session) => set((state) => ({
          sessions: { ...state.sessions, [session.id]: session }
        })),
        
        updateSession: (id, updates) => set((state) => ({
          sessions: state.sessions[id] 
            ? { ...state.sessions, [id]: { ...state.sessions[id], ...updates } }
            : state.sessions
        })),
        
        removeSession: (id) => set((state) => {
          const { [id]: removed, ...sessions } = state.sessions;
          return {
            sessions,
            activeSession: state.activeSession === id ? null : state.activeSession,
          };
        }),
        
        setActiveSession: (id) => set({ activeSession: id }),
        
        // Terminal actions
        addTerminal: (terminal) => set((state) => ({
          terminals: { ...state.terminals, [terminal.id]: terminal }
        })),
        
        updateTerminal: (id, updates) => set((state) => ({
          terminals: state.terminals[id]
            ? { ...state.terminals, [id]: { ...state.terminals[id], ...updates } }
            : state.terminals
        })),
        
        removeTerminal: (id) => set((state) => {
          const { [id]: removed, ...terminals } = state.terminals;
          return { terminals };
        }),
        
        // UI actions
        toggleSidebar: () => set((state) => ({
          ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen }
        })),
        
        setSidebarOpen: (open) => set((state) => ({
          ui: { ...state.ui, sidebarOpen: open }
        })),
        
        setTheme: (theme) => set((state) => ({
          ui: { ...state.ui, theme }
        })),
        
        addNotification: (notification) => set((state) => {
          const id = Date.now().toString();
          const newNotification = {
            ...notification,
            id,
            timestamp: new Date(),
          };
          
          // Auto-remove after 5 seconds if autoHide is not false
          if (notification.autoHide !== false) {
            setTimeout(() => {
              set((state) => ({
                ui: {
                  ...state.ui,
                  notifications: state.ui.notifications.filter(n => n.id !== id)
                }
              }));
            }, 5000);
          }
          
          return {
            ui: {
              ...state.ui,
              notifications: [...state.ui.notifications, newNotification]
            }
          };
        }),
        
        removeNotification: (id) => set((state) => ({
          ui: {
            ...state.ui,
            notifications: state.ui.notifications.filter(n => n.id !== id)
          }
        })),
        
        clearNotifications: () => set((state) => ({
          ui: { ...state.ui, notifications: [] }
        })),
        
        // Settings actions
        updateSettings: (updates) => set((state) => ({
          settings: { ...state.settings, ...updates }
        })),
        
        updateTerminalSettings: (updates) => set((state) => ({
          settings: {
            ...state.settings,
            terminalSettings: { ...state.settings.terminalSettings, ...updates }
          }
        })),
        
        toggleDangerousMode: () => set((state) => ({
          settings: {
            ...state.settings,
            dangerousMode: !state.settings.dangerousMode
          }
        })),
        
        // Utility actions
        reset: () => set(initialState),
      })),
      {
        name: 'vibecode-app-store',
        partialize: (state) => ({
          // Only persist certain parts of the state
          ui: {
            theme: state.ui.theme,
            sidebarOpen: state.ui.sidebarOpen,
          },
          settings: state.settings,
          selectedProject: state.selectedProject,
        }),
      }
    ),
    {
      name: 'vibecode-app-store',
    }
  )
);

// Selector hooks for common use cases
export const useProjects = () => useAppStore((state) => state.projects);
export const useSelectedProject = () => useAppStore((state) => state.selectedProject);
export const useSessions = () => useAppStore((state) => state.sessions);
export const useActiveSession = () => useAppStore((state) => state.activeSession);
export const useTerminals = () => useAppStore((state) => state.terminals);
export const useUI = () => useAppStore((state) => state.ui);
export const useSettings = () => useAppStore((state) => state.settings);
export const useNotifications = () => useAppStore((state) => state.ui.notifications);

// Action hooks
export const useProjectActions = () => useAppStore((state) => ({
  setProjects: state.setProjects,
  addProject: state.addProject,
  updateProject: state.updateProject,
  removeProject: state.removeProject,
  selectProject: state.selectProject,
}));

export const useSessionActions = () => useAppStore((state) => ({
  addSession: state.addSession,
  updateSession: state.updateSession,
  removeSession: state.removeSession,
  setActiveSession: state.setActiveSession,
}));

export const useTerminalActions = () => useAppStore((state) => ({
  addTerminal: state.addTerminal,
  updateTerminal: state.updateTerminal,
  removeTerminal: state.removeTerminal,
}));

export const useUIActions = () => useAppStore((state) => ({
  toggleSidebar: state.toggleSidebar,
  setSidebarOpen: state.setSidebarOpen,
  setTheme: state.setTheme,
  addNotification: state.addNotification,
  removeNotification: state.removeNotification,
  clearNotifications: state.clearNotifications,
}));

export const useSettingsActions = () => useAppStore((state) => ({
  updateSettings: state.updateSettings,
  updateTerminalSettings: state.updateTerminalSettings,
  toggleDangerousMode: state.toggleDangerousMode,
}));