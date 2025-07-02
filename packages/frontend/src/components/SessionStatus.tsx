import { useEffect, useState } from 'react';
import { Wifi, WifiOff, AlertCircle, Terminal } from 'lucide-react';
import { useSessionStore } from '../stores/sessionStore';

export function SessionStatus() {
  const {
    sessionId,
    isConnected,
    connectorUrl,
    lastConnectedAt,
    openSessionManager,
    setConnected,
    updateLastConnected,
  } = useSessionStore();

  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // Check connection status on mount and periodically
    checkConnectionStatus();
    const interval = setInterval(checkConnectionStatus, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [sessionId, connectorUrl]);

  const checkConnectionStatus = async () => {
    if (!sessionId) {
      setConnected(false);
      return;
    }

    setIsChecking(true);

    try {
      // Check if desktop connector is running
      const healthResponse = await fetch(`${connectorUrl}/api/v1/health`);

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();

        if (healthData.type === 'desktop-connector') {
          // Try to verify the session exists
          try {
            const sessionResponse = await fetch(
              `${connectorUrl}/api/v1/sessions/${sessionId}/status`
            );
            const sessionConnected = sessionResponse.ok;

            setConnected(sessionConnected);
            if (sessionConnected) {
              updateLastConnected();
            }
          } catch {
            // If session endpoint doesn't exist, assume connected if health check passed
            setConnected(true);
            updateLastConnected();
          }
        } else {
          setConnected(false);
        }
      } else {
        setConnected(false);
      }
    } catch (error) {
      setConnected(false);
    } finally {
      setIsChecking(false);
    }
  };

  const getStatusColor = () => {
    if (!sessionId) return 'text-gray-500';
    if (isConnected) return 'text-green-600';
    return 'text-red-600';
  };

  const getStatusIcon = () => {
    if (!sessionId) {
      return <AlertCircle className='w-4 h-4' />;
    }
    if (isConnected) {
      return <Wifi className='w-4 h-4' />;
    }
    return <WifiOff className='w-4 h-4' />;
  };

  const getStatusText = () => {
    if (!sessionId) return 'No Session';
    if (isChecking) return 'Checking...';
    if (isConnected) return 'Connected';
    return 'Disconnected';
  };

  const getTooltipText = () => {
    if (!sessionId) {
      return 'No active session. Click to start or connect to a session.';
    }
    if (isConnected) {
      const timeAgo = lastConnectedAt
        ? `Last connected: ${new Date(lastConnectedAt).toLocaleTimeString()}`
        : 'Connected';
      return `Session: ${sessionId.substring(0, 8)}... | ${timeAgo}`;
    }
    return `Session: ${sessionId.substring(0, 8)}... | Click to reconnect or start new session`;
  };

  return (
    <button
      onClick={openSessionManager}
      className={`flex items-center space-x-2 px-3 py-1 rounded-lg border transition-colors hover:bg-gray-50 ${getStatusColor()}`}
      title={getTooltipText()}
    >
      <div className='relative'>
        {getStatusIcon()}
        {isChecking && (
          <div className='absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full animate-pulse'></div>
        )}
      </div>
      <span className='text-sm font-medium'>{getStatusText()}</span>
      {sessionId && (
        <div className='flex items-center space-x-1'>
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          ></div>
          <Terminal className='w-3 h-3 text-gray-400' />
        </div>
      )}
    </button>
  );
}
