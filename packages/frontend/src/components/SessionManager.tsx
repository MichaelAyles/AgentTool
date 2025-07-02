import { useState, useEffect } from 'react';
import {
  AlertCircle,
  Terminal,
  Copy,
  ExternalLink,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface SessionManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionChange: (sessionId: string) => void;
}

interface SessionStatus {
  hasActiveSession: boolean;
  sessionId?: string;
  connectorRunning: boolean;
  connectorUrl: string;
}

export function SessionManager({
  isOpen,
  onClose,
  onSessionChange,
}: SessionManagerProps) {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({
    hasActiveSession: false,
    connectorRunning: false,
    connectorUrl: 'http://localhost:3000',
  });
  const [inputSessionId, setInputSessionId] = useState('');
  const [newSessionId, setNewSessionId] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkSessionStatus();
      generateNewSessionId();
    }
  }, [isOpen]);

  const generateNewSessionId = () => {
    setNewSessionId(uuidv4());
  };

  const checkSessionStatus = async () => {
    setIsChecking(true);

    try {
      // Check if desktop connector is running
      const response = await fetch(
        `${sessionStatus.connectorUrl}/api/v1/health`
      );
      const data = await response.json();

      if (data.type === 'desktop-connector') {
        // Check for existing session
        const currentSessionId = localStorage.getItem('vibe-code-session-id');
        let hasActiveSession = false;

        if (currentSessionId) {
          try {
            const sessionResponse = await fetch(
              `${sessionStatus.connectorUrl}/api/v1/sessions/${currentSessionId}/status`
            );
            hasActiveSession = sessionResponse.ok;
          } catch {
            // Session doesn't exist or connector doesn't support session checking
            hasActiveSession = false;
          }
        }

        setSessionStatus({
          hasActiveSession,
          sessionId: hasActiveSession ? currentSessionId : undefined,
          connectorRunning: true,
          connectorUrl: sessionStatus.connectorUrl,
        });
      } else {
        setSessionStatus(prev => ({
          ...prev,
          hasActiveSession: false,
          connectorRunning: false,
        }));
      }
    } catch (error) {
      // Desktop connector not available
      setSessionStatus(prev => ({
        ...prev,
        hasActiveSession: false,
        connectorRunning: false,
      }));
    } finally {
      setIsChecking(false);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(type);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleUseExistingSession = () => {
    if (inputSessionId.trim()) {
      localStorage.setItem('vibe-code-session-id', inputSessionId.trim());
      onSessionChange(inputSessionId.trim());
      onClose();
    }
  };

  const handleStartNewSession = () => {
    localStorage.setItem('vibe-code-session-id', newSessionId);
    onSessionChange(newSessionId);
    onClose();
  };

  const openConnectorInNewTab = () => {
    window.open(sessionStatus.connectorUrl, '_blank');
  };

  const getConnectorCommand = () => {
    return `vibe-code-desktop start --session-id ${newSessionId}`;
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'>
      <div className='bg-white rounded-lg shadow-xl max-w-md w-full mx-4'>
        {/* Header */}
        <div className='flex items-center justify-between p-4 border-b border-gray-200'>
          <div className='flex items-center space-x-2'>
            <AlertCircle className='w-5 h-5 text-orange-600' />
            <h3 className='text-lg font-semibold text-gray-900'>
              No Active Session
            </h3>
          </div>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-gray-600 transition-colors'
          >
            <X className='w-5 h-5' />
          </button>
        </div>

        {/* Content */}
        <div className='p-4 space-y-4'>
          {/* Status */}
          <div className='flex items-center space-x-2 text-sm'>
            {sessionStatus.connectorRunning ? (
              <>
                <Wifi className='w-4 h-4 text-green-600' />
                <span className='text-green-700'>
                  Desktop connector running
                </span>
              </>
            ) : (
              <>
                <WifiOff className='w-4 h-4 text-red-600' />
                <span className='text-red-700'>
                  Desktop connector not detected
                </span>
              </>
            )}
            {isChecking && (
              <div className='w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin'></div>
            )}
          </div>

          {/* Current Session Info */}
          {sessionStatus.hasActiveSession && sessionStatus.sessionId && (
            <div className='bg-green-50 border border-green-200 rounded-lg p-3'>
              <p className='text-sm text-green-800 font-medium'>
                Active Session Found
              </p>
              <p className='text-xs text-green-600 font-mono mt-1'>
                {sessionStatus.sessionId}
              </p>
              <button
                onClick={() => onSessionChange(sessionStatus.sessionId!)}
                className='mt-2 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors'
              >
                Continue Session
              </button>
            </div>
          )}

          {/* Options */}
          <div className='space-y-4'>
            {/* Option 1: Enter existing session */}
            <div className='border border-gray-200 rounded-lg p-4'>
              <h4 className='font-medium text-gray-900 mb-2'>
                Option 1: Enter Existing Session
              </h4>
              <p className='text-sm text-gray-600 mb-3'>
                If you have an active session ID from another tab or device:
              </p>
              <div className='flex space-x-2'>
                <input
                  type='text'
                  value={inputSessionId}
                  onChange={e => setInputSessionId(e.target.value)}
                  placeholder='Enter session UUID'
                  className='flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                />
                <button
                  onClick={handleUseExistingSession}
                  disabled={!inputSessionId.trim()}
                  className='bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                >
                  Connect
                </button>
              </div>
            </div>

            {/* Option 2: Start new session */}
            <div className='border border-gray-200 rounded-lg p-4'>
              <h4 className='font-medium text-gray-900 mb-2'>
                Option 2: Start New Session
              </h4>

              {/* New Session ID */}
              <div className='bg-gray-50 rounded p-3 mb-3'>
                <p className='text-sm text-gray-600 mb-2'>New session ID:</p>
                <div className='flex items-center space-x-2'>
                  <code className='flex-1 bg-white px-2 py-1 rounded border text-xs font-mono'>
                    {newSessionId}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newSessionId, 'session')}
                    className='text-gray-500 hover:text-gray-700 transition-colors'
                    title='Copy session ID'
                  >
                    <Copy className='w-4 h-4' />
                  </button>
                  <button
                    onClick={generateNewSessionId}
                    className='text-blue-600 hover:text-blue-800 text-xs transition-colors'
                  >
                    Generate New
                  </button>
                </div>
                {copySuccess === 'session' && (
                  <p className='text-xs text-green-600 mt-1'>
                    Session ID copied!
                  </p>
                )}
              </div>

              {/* Desktop Connector Instructions */}
              <div className='space-y-3'>
                {sessionStatus.connectorRunning ? (
                  /* Connector is running */
                  <div>
                    <p className='text-sm text-gray-600 mb-2'>
                      Desktop connector is running. Click to start this session:
                    </p>
                    <div className='flex space-x-2'>
                      <button
                        onClick={handleStartNewSession}
                        className='bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 transition-colors flex items-center space-x-2'
                      >
                        <Terminal className='w-4 h-4' />
                        <span>Start Session</span>
                      </button>
                      <button
                        onClick={openConnectorInNewTab}
                        className='bg-gray-600 text-white px-4 py-2 rounded text-sm hover:bg-gray-700 transition-colors flex items-center space-x-2'
                      >
                        <ExternalLink className='w-4 h-4' />
                        <span>Open Connector</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Connector not running */
                  <div>
                    <p className='text-sm text-gray-600 mb-2'>
                      Start the desktop connector with this session:
                    </p>
                    <div className='bg-black text-green-400 rounded p-3 font-mono text-xs mb-2 overflow-x-auto'>
                      {getConnectorCommand()}
                    </div>
                    <div className='flex space-x-2'>
                      <button
                        onClick={() =>
                          copyToClipboard(getConnectorCommand(), 'command')
                        }
                        className='bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors flex items-center space-x-2'
                      >
                        <Copy className='w-4 h-4' />
                        <span>Copy Command</span>
                      </button>
                      <button
                        onClick={handleStartNewSession}
                        className='bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 transition-colors'
                      >
                        Use Session ID
                      </button>
                    </div>
                    {copySuccess === 'command' && (
                      <p className='text-xs text-green-600 mt-1'>
                        Command copied!
                      </p>
                    )}

                    <div className='mt-3 p-3 bg-blue-50 border border-blue-200 rounded'>
                      <p className='text-xs text-blue-800'>
                        💡 After running the command, the desktop connector will
                        be available at{' '}
                        <a
                          href={sessionStatus.connectorUrl}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='underline hover:text-blue-900'
                        >
                          {sessionStatus.connectorUrl}
                        </a>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Refresh Button */}
          <div className='flex justify-center'>
            <button
              onClick={checkSessionStatus}
              disabled={isChecking}
              className='text-blue-600 hover:text-blue-800 text-sm transition-colors disabled:text-gray-400'
            >
              {isChecking ? 'Checking...' : 'Refresh Status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
