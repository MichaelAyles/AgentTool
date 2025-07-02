import { useProcessMonitoring } from './useSocket';

/**
 * WebSocket hook for terminal components
 * This is a wrapper around useProcessMonitoring to provide the expected API
 */
export function useWebSocket() {
  const { socket, isConnected } = useProcessMonitoring();

  return {
    socket,
    isConnected,
  };
}
