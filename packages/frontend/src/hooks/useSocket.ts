import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useSessionStore } from '../stores/sessionStore';

let socket: Socket | null = null;

export function useSocket(): Socket | null {
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const { sessionId, centralServiceUrl } = useSessionStore();

  useEffect(() => {
    if (!socket && sessionId) {
      // Connect to centralized service with session ID
      socket = io(`${centralServiceUrl}/frontend`, {
        auth: {
          sessionId,
          type: 'frontend',
          version: '1.0.0',
        },
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
      });

      socket.on('connect', () => {
        console.log('Socket connected to central service:', socket?.id);
        console.log('Session ID:', sessionId);
      });

      socket.on('disconnect', reason => {
        console.log('Socket disconnected from central service:', reason);
      });

      socket.on('error', error => {
        console.error('Socket error:', error);
      });

      // Register frontend with the session
      socket.emit('frontend:register', {
        sessionId,
        metadata: {
          version: '1.0.0',
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      });
    }

    setSocketInstance(socket);

    return () => {
      // Don't disconnect on unmount, keep connection alive
      // socket?.disconnect();
    };
  }, [sessionId, centralServiceUrl]);

  return socketInstance;
}

// Helper hook for process monitoring events
export function useProcessMonitoring() {
  const socket = useSocket();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket]);

  const subscribeToSession = (sessionId: string) => {
    socket?.emit('process:subscribe-session', { sessionId });
  };

  const unsubscribeFromSession = (sessionId: string) => {
    socket?.emit('process:unsubscribe-session', { sessionId });
  };

  const getHealth = () => {
    socket?.emit('process:get-health');
  };

  const getMetrics = () => {
    socket?.emit('process:get-metrics');
  };

  const getLimits = () => {
    socket?.emit('process:get-limits');
  };

  const updateLimits = (limits: any) => {
    socket?.emit('process:update-limits', limits);
  };

  const terminateSession = (sessionId: string) => {
    socket?.emit('process:terminate-session', { sessionId });
  };

  return {
    socket,
    isConnected,
    subscribeToSession,
    unsubscribeFromSession,
    getHealth,
    getMetrics,
    getLimits,
    updateLimits,
    terminateSession,
  };
}
