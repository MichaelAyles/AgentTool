import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
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
  deleteProject: (id: string) => void;
  selectProject: (project: Project | null) => void;
  
  // Session actions
  setSessions: (sessions: Record<string, Session>) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  deleteSession: (id: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  
  // Terminal actions
  addTerminal: (terminal: AppState['terminals'][string]) => void;
  updateTerminal: (id: string, updates: Partial<AppState['terminals'][string]>) => void;
  removeTerminal: (id: string) => void;
  
  // UI actions
  toggleSidebar: () => void;
  setTheme: (theme: AppState['ui']['theme']) => void;
  addNotification: (notification: AppState['ui']['notifications'][0]) => void;
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
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      theme: 'dark',
      cursorBlink: true,
    },
  },
};

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set) => ({
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
        deleteProject: (id) => set((state) => ({
          projects: state.projects.filter(p => p.id !== id)
        })),
        selectProject: (project) => set({ selectedProject: project }),
        
        // Session actions
        setSessions: (sessions) => set({ sessions }),
        addSession: (session) => set((state) => ({
          sessions: { ...state.sessions, [session.id]: session }
        })),
        updateSession: (id, updates) => set((state) => ({
          sessions: {
            ...state.sessions,
            [id]: { ...state.sessions[id], ...updates }
          }
        })),
        deleteSession: (id) => set((state) => {
          const { [id]: deleted, ...rest } = state.sessions;
          return { sessions: rest };
        }),
        setActiveSession: (sessionId) => set({ activeSession: sessionId }),
        
        // Terminal actions
        addTerminal: (terminal) => set((state) => ({
          terminals: { ...state.terminals, [terminal.id]: terminal }
        })),
        updateTerminal: (id, updates) => set((state) => ({
          terminals: {
            ...state.terminals,
            [id]: { ...state.terminals[id], ...updates }
          }
        })),
        removeTerminal: (id) => set((state) => {
          const { [id]: deleted, ...rest } = state.terminals;
          return { terminals: rest };
        }),
        
        // UI actions
        toggleSidebar: () => set((state) => ({
          ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen }
        })),
        setTheme: (theme) => set((state) => ({
          ui: { ...state.ui, theme }
        })),
        addNotification: (notification) => set((state) => ({
          ui: {
            ...state.ui,
            notifications: [notification, ...state.ui.notifications]
          }
        })),
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
      }),
      {
        name: 'vibecode-app-store',
        partialize: (state) => ({
          ui: {
            theme: state.ui.theme,
            sidebarOpen: state.ui.sidebarOpen,
          },
          settings: state.settings,
          selectedProject: state.selectedProject,
        }),
      }
    ),
    { name: 'vibecode-devtools' }
  )
);

// Selector hooks for common use cases
export const useProjects = () => useAppStore((state) => state.projects);
export const useSelectedProject = () => useAppStore((state) => state.selectedProject);
export const useSessions = () => useAppStore((state) => state.sessions);
export const useActiveSession = () => useAppStore((state) => state.activeSession);
export const useUI = () => useAppStore((state) => state.ui);
export const useSettings = () => useAppStore((state) => state.settings);
export const useTerminals = () => useAppStore((state) => state.terminals);
export const useNotifications = () => useAppStore((state) => state.ui.notifications);

// Action hooks
export const useProjectActions = () => useAppStore((state) => ({
  setProjects: state.setProjects,
  addProject: state.addProject,
  updateProject: state.updateProject,
  deleteProject: state.deleteProject,
  selectProject: state.selectProject,
}));

export const useUIActions = () => useAppStore((state) => ({
  toggleSidebar: state.toggleSidebar,
  setTheme: state.setTheme,
  addNotification: state.addNotification,
  removeNotification: state.removeNotification,
  clearNotifications: state.clearNotifications,
}));

export const useSessionActions = () => useAppStore((state) => ({
  setSessions: state.setSessions,
  addSession: state.addSession,
  updateSession: state.updateSession,
  deleteSession: state.deleteSession,
  setActiveSession: state.setActiveSession,
}));

export const useTerminalActions = () => useAppStore((state) => ({
  addTerminal: state.addTerminal,
  updateTerminal: state.updateTerminal,
  removeTerminal: state.removeTerminal,
}));

export const useSettingsActions = () => useAppStore((state) => ({
  updateSettings: state.updateSettings,
  updateTerminalSettings: state.updateTerminalSettings,
  toggleDangerousMode: state.toggleDangerousMode,
}));