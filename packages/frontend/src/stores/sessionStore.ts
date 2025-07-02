import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SessionState {
  sessionId: string | null;
  isConnected: boolean;
  connectorUrl: string;
  lastConnectedAt: Date | null;
  showSessionManager: boolean;

  // Actions
  setSessionId: (sessionId: string) => void;
  setConnected: (connected: boolean) => void;
  setConnectorUrl: (url: string) => void;
  openSessionManager: () => void;
  closeSessionManager: () => void;
  clearSession: () => void;
  updateLastConnected: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    set => ({
      sessionId: null,
      isConnected: false,
      connectorUrl: 'http://localhost:3000',
      lastConnectedAt: null,
      showSessionManager: false,

      setSessionId: (sessionId: string) =>
        set({
          sessionId,
          lastConnectedAt: new Date(),
        }),

      setConnected: (connected: boolean) =>
        set({
          isConnected: connected,
          lastConnectedAt: connected ? new Date() : undefined,
        }),

      setConnectorUrl: (url: string) => set({ connectorUrl: url }),

      openSessionManager: () => set({ showSessionManager: true }),

      closeSessionManager: () => set({ showSessionManager: false }),

      clearSession: () =>
        set({
          sessionId: null,
          isConnected: false,
          lastConnectedAt: null,
          showSessionManager: false,
        }),

      updateLastConnected: () => set({ lastConnectedAt: new Date() }),
    }),
    {
      name: 'vibe-code-session',
      partialize: state => ({
        sessionId: state.sessionId,
        connectorUrl: state.connectorUrl,
        lastConnectedAt: state.lastConnectedAt,
      }),
    }
  )
);
