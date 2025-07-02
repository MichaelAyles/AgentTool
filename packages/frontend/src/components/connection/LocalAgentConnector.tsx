import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Copy,
  Check,
  Terminal,
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';

interface ConnectionStatus {
  status: 'pending' | 'connected' | 'expired';
  tunnelUrl?: string;
  timestamp?: number;
  clientInfo?: {
    platform: string;
    version: string;
    userAgent?: string;
  };
  message?: string;
  instructions?: string;
}

interface LocalAgentConnectorProps {
  onConnection?: (tunnelUrl: string) => void;
  className?: string;
}

export const LocalAgentConnector: React.FC<LocalAgentConnectorProps> = ({
  onConnection,
  className = '',
}) => {
  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<ConnectionStatus>({ status: 'pending' });
  const [isPolling, setIsPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Generate session ID on component mount
  useEffect(() => {
    const newSessionId = uuidv4();
    setSessionId(newSessionId);
    setError(null);
  }, []);

  // Start polling when session ID is generated
  useEffect(() => {
    if (sessionId && !isPolling) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [sessionId]);

  // Timer for elapsed time
  useEffect(() => {
    if (isPolling && status.status === 'pending') {
      startTimeRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isPolling, status.status]);

  const startPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    setIsPolling(true);
    setElapsedTime(0);

    // Poll immediately, then every 2 seconds
    checkConnectionStatus();
    pollingIntervalRef.current = setInterval(checkConnectionStatus, 2000);
  };

  const stopPolling = () => {
    setIsPolling(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch(
        `/api/v1/connection/status?sessionId=${sessionId}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const connectionStatus: ConnectionStatus = await response.json();
      setStatus(connectionStatus);
      setError(null);

      if (connectionStatus.status === 'connected') {
        stopPolling();
        if (connectionStatus.tunnelUrl && onConnection) {
          onConnection(connectionStatus.tunnelUrl);
        }
      } else if (connectionStatus.status === 'expired') {
        stopPolling();
        setError(
          'Connection session expired. Please refresh to generate a new connection.'
        );
      }
    } catch (err) {
      console.error('Error checking connection status:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to check connection status'
      );
    }
  };

  const copyToClipboard = async () => {
    try {
      const command = getInstallCommand();
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = getInstallCommand();
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getInstallCommand = () => {
    const baseUrl = window.location.origin;
    return `curl -sSL ${baseUrl}/install.sh | bash -s -- ${sessionId}`;
  };

  const resetConnection = () => {
    const newSessionId = uuidv4();
    setSessionId(newSessionId);
    setStatus({ status: 'pending' });
    setError(null);
    setElapsedTime(0);
    setCopied(false);
  };

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case 'pending':
        return <Loader2 className='h-5 w-5 animate-spin text-blue-500' />;
      case 'connected':
        return <Wifi className='h-5 w-5 text-green-500' />;
      case 'expired':
        return <WifiOff className='h-5 w-5 text-red-500' />;
      default:
        return <WifiOff className='h-5 w-5 text-gray-400' />;
    }
  };

  const getStatusMessage = () => {
    switch (status.status) {
      case 'pending':
        return 'Waiting for local agent connection...';
      case 'connected':
        return 'Local agent connected successfully!';
      case 'expired':
        return 'Connection session expired';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 ${className}`}
    >
      <div className='flex items-center mb-6'>
        <Terminal className='h-6 w-6 text-blue-500 mr-3' />
        <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>
          Connect Local Terminal
        </h2>
      </div>

      {error && (
        <div className='mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg'>
          <div className='flex items-center'>
            <AlertTriangle className='h-5 w-5 text-red-500 mr-2' />
            <span className='text-red-700 dark:text-red-300'>{error}</span>
          </div>
        </div>
      )}

      <div className='space-y-6'>
        {/* Status Section */}
        <div className='flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg'>
          <div className='flex items-center'>
            {getStatusIcon()}
            <span className='ml-3 text-sm font-medium text-gray-700 dark:text-gray-300'>
              {getStatusMessage()}
            </span>
          </div>
          {status.status === 'pending' && (
            <span className='text-sm text-gray-500 dark:text-gray-400'>
              {formatElapsedTime(elapsedTime)}
            </span>
          )}
        </div>

        {/* Connection Details */}
        {status.status === 'connected' && status.tunnelUrl && (
          <div className='p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg'>
            <h3 className='text-sm font-medium text-green-800 dark:text-green-200 mb-2'>
              Connection Details
            </h3>
            <div className='text-sm text-green-700 dark:text-green-300 space-y-1'>
              <div>
                <strong>Tunnel URL:</strong> {status.tunnelUrl}
              </div>
              {status.clientInfo && (
                <>
                  <div>
                    <strong>Platform:</strong> {status.clientInfo.platform}
                  </div>
                  <div>
                    <strong>Version:</strong> {status.clientInfo.version}
                  </div>
                </>
              )}
              {status.timestamp && (
                <div>
                  <strong>Connected:</strong>{' '}
                  {new Date(status.timestamp).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        {status.status === 'pending' && (
          <>
            <div className='space-y-3'>
              <h3 className='text-lg font-medium text-gray-900 dark:text-white'>
                Connect Your Local Machine
              </h3>
              <p className='text-gray-600 dark:text-gray-400'>
                To connect your local terminal to this web interface, paste and
                run this command in your terminal:
              </p>
            </div>

            {/* Command Section */}
            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                  Installation Command
                </label>
                <button
                  onClick={copyToClipboard}
                  className='flex items-center px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors'
                >
                  {copied ? (
                    <>
                      <Check className='h-4 w-4 mr-1' />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className='h-4 w-4 mr-1' />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className='relative'>
                <pre className='bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto border'>
                  <code>{getInstallCommand()}</code>
                </pre>
              </div>
            </div>

            {/* Additional Instructions */}
            <div className='space-y-2 text-sm text-gray-600 dark:text-gray-400'>
              <p>
                <strong>What this command does:</strong>
              </p>
              <ul className='list-disc list-inside space-y-1 ml-4'>
                <li>Downloads the Vibe Code local agent installer</li>
                <li>Installs necessary dependencies (Node.js, Bun, Git)</li>
                <li>Sets up a secure tunnel to your local machine</li>
                <li>Registers the connection with this session</li>
              </ul>

              <p className='pt-2'>
                <strong>Requirements:</strong> macOS, Linux, or Windows with
                WSL2
              </p>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className='flex space-x-3'>
          {status.status === 'expired' && (
            <button
              onClick={resetConnection}
              className='flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors'
            >
              Generate New Connection
            </button>
          )}

          {status.status === 'pending' && (
            <button
              onClick={resetConnection}
              className='px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
            >
              Reset Connection
            </button>
          )}
        </div>

        {/* Session Info */}
        <div className='pt-4 border-t border-gray-200 dark:border-gray-600'>
          <div className='flex justify-between text-xs text-gray-500 dark:text-gray-400'>
            <span>Session ID: {sessionId.slice(0, 8)}...</span>
            <span>Auto-expires in 5 minutes</span>
          </div>
        </div>
      </div>
    </div>
  );
};
