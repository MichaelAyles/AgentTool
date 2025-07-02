import { useEffect } from 'react';
import { useSessionStore } from '../stores/sessionStore';

export function SessionInitializer() {
  const {
    sessionId,
    isConnected,
    openSessionManager,
    setConnected,
    connectorUrl,
  } = useSessionStore();

  useEffect(() => {
    // Check session status on app initialization
    initializeSession();
  }, []);

  const initializeSession = async () => {
    // If no session ID, show session manager
    if (!sessionId) {
      // Small delay to let the app render first
      setTimeout(() => {
        openSessionManager();
      }, 1000);
      return;
    }

    // If we have a session ID, try to verify it's still valid
    try {
      const response = await fetch(`${connectorUrl}/api/v1/health`);
      if (response.ok) {
        const data = await response.json();
        if (data.type === 'desktop-connector') {
          // Try to check session status
          try {
            const sessionResponse = await fetch(
              `${connectorUrl}/api/v1/sessions/${sessionId}/status`
            );
            setConnected(sessionResponse.ok);
          } catch {
            // If session endpoint doesn't exist, assume connected if health check passed
            setConnected(true);
          }
        } else {
          setConnected(false);
        }
      } else {
        setConnected(false);
      }
    } catch (error) {
      setConnected(false);
      // If we can't connect and have a session, show the session manager
      setTimeout(() => {
        openSessionManager();
      }, 2000);
    }
  };

  // This component doesn't render anything
  return null;
}
