import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function useSocket(): Socket | null {
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);

  useEffect(() => {
    if (!socket) {
      socket = io('/', {
        transports: ['websocket', 'polling'],
        autoConnect: true,
      });

      socket.on('connect', () => {
        console.log('Socket connected:', socket?.id);
      });

      socket.on('disconnect', reason => {
        console.log('Socket disconnected:', reason);
      });

      socket.on('error', error => {
        console.error('Socket error:', error);
      });
    }

    setSocketInstance(socket);

    return () => {
      // Don't disconnect on unmount, keep connection alive
      // socket?.disconnect();
    };
  }, []);

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
