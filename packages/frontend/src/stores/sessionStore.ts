import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SessionState {
  sessionId: string | null;
  isConnected: boolean;
  centralServiceUrl: string;
  lastConnectedAt: Date | null;
  showSessionManager: boolean;

  // Actions
  setSessionId: (sessionId: string) => void;
  setConnected: (connected: boolean) => void;
  setCentralServiceUrl: (url: string) => void;
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
      centralServiceUrl: 'https://vibe.theduck.chat',
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

      setCentralServiceUrl: (url: string) => set({ centralServiceUrl: url }),

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
        centralServiceUrl: state.centralServiceUrl,
        lastConnectedAt: state.lastConnectedAt,
      }),
    }
  )
);
