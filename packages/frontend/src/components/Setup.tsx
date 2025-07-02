import { useState, useEffect } from 'react';
import {
  Download,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader,
  Terminal,
  Globe,
} from 'lucide-react';
import { api } from '../services/api';

interface SystemInfo {
  rootDirectory: string;
  version: string;
  platform: string;
  nodeVersion: string;
  timestamp: string;
  type: 'desktop-connector' | 'cloud';
}

export function Setup() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [backendType, setBackendType] = useState<
    'cloud' | 'local' | 'auto' | 'central'
  >('auto');
  const [localConnected, setLocalConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkBackendStatus();
  }, []);

  const checkBackendStatus = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check system info
      const info = await api.getSystemInfo();
      setSystemInfo((info as any).data);

      // Check if local backend is available
      try {
        const response = await fetch('http://localhost:3000/api/v1/health');
        if (response.ok) {
          const healthData = await response.json();
          setLocalConnected(healthData.type === 'desktop-connector');
        }
      } catch {
        setLocalConnected(false);
      }

      const config = api.getCentralBackendConfig();
      setBackendType('central');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to check backend status'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const setBackendMode = async (
    mode: 'cloud' | 'local' | 'auto' | 'central'
  ) => {
    try {
      api.setCentralBackendConfig({ centralUrl: 'https://vibe.theduck.chat' });
      setBackendType('central');
      await checkBackendStatus();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to set backend mode'
      );
    }
  };

  const downloadInstaller = () => {
    const installCommand = `curl -fsSL ${window.location.origin}/install-desktop.sh | bash`;
    navigator.clipboard.writeText(installCommand);

    // Create and download the installer script
    const element = document.createElement('a');
    element.href = '/install-desktop.sh';
    element.download = 'install-desktop.sh';
    element.click();
  };

  const copyInstallCommand = () => {
    const installCommand = `curl -fsSL ${window.location.origin}/install-desktop.sh | bash`;
    navigator.clipboard.writeText(installCommand);

    // Show success message (could be improved with a toast notification)
    const button = document.querySelector('.copy-button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    }
  };

  const isVercelDeployment =
    window.location.hostname.includes('vercel.app') ||
    import.meta.env.VERCEL_URL;

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <Loader className='w-8 h-8 animate-spin text-blue-600' />
      </div>
    );
  }

  return (
    <div className='max-w-4xl mx-auto p-6 space-y-8'>
      <div className='text-center'>
        <h1 className='text-3xl font-bold text-gray-900 mb-2'>
          Vibe Code Setup
        </h1>
        <p className='text-gray-600'>Choose how you want to use Vibe Code</p>
        {isVercelDeployment && (
          <div className='mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3'>
            <p className='text-sm text-blue-800'>
              🌟 You're using the Vercel-hosted version. Install the desktop
              connector below for full functionality.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className='bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2'>
          <AlertCircle className='w-5 h-5 text-red-600' />
          <span className='text-red-700'>{error}</span>
        </div>
      )}

      {/* Current Status */}
      <div className='bg-gray-50 rounded-lg p-6'>
        <h2 className='text-xl font-semibold mb-4'>Current Status</h2>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          <div className='flex items-center space-x-3'>
            <div
              className={`w-3 h-3 rounded-full ${systemInfo?.type === 'cloud' ? 'bg-green-500' : 'bg-gray-300'}`}
            />
            <span className='font-medium'>Cloud Backend</span>
            <span className='text-sm text-gray-600'>
              {systemInfo?.type === 'cloud' ? 'Connected' : 'Available'}
            </span>
          </div>
          <div className='flex items-center space-x-3'>
            <div
              className={`w-3 h-3 rounded-full ${localConnected ? 'bg-green-500' : 'bg-gray-300'}`}
            />
            <span className='font-medium'>Desktop Connector</span>
            <span className='text-sm text-gray-600'>
              {localConnected ? 'Connected' : 'Not Running'}
            </span>
          </div>
        </div>
      </div>

      {/* Backend Selection */}
      <div className='bg-white border rounded-lg p-6'>
        <h2 className='text-xl font-semibold mb-4'>Backend Configuration</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <button
            onClick={() => setBackendMode('cloud')}
            className={`p-4 border rounded-lg text-left transition-colors ${
              backendType === 'cloud'
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Globe className='w-6 h-6 mb-2' />
            <h3 className='font-medium'>Cloud Only</h3>
            <p className='text-sm text-gray-600'>Use only the cloud backend</p>
          </button>

          <button
            onClick={() => setBackendMode('local')}
            className={`p-4 border rounded-lg text-left transition-colors ${
              backendType === 'local'
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Terminal className='w-6 h-6 mb-2' />
            <h3 className='font-medium'>Desktop Only</h3>
            <p className='text-sm text-gray-600'>
              Use only the desktop connector
            </p>
          </button>

          <button
            onClick={() => setBackendMode('auto')}
            className={`p-4 border rounded-lg text-left transition-colors ${
              backendType === 'auto'
                ? 'border-blue-500 bg-blue-50 text-blue-900'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <CheckCircle className='w-6 h-6 mb-2' />
            <h3 className='font-medium'>Auto Detect</h3>
            <p className='text-sm text-gray-600'>
              Try desktop first, fallback to cloud
            </p>
          </button>
        </div>
      </div>

      {/* Desktop Connector Installation */}
      <div className='bg-white border rounded-lg p-6'>
        <h2 className='text-xl font-semibold mb-4'>Desktop Connector</h2>

        {localConnected ? (
          <div className='bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3'>
            <CheckCircle className='w-6 h-6 text-green-600' />
            <div>
              <p className='font-medium text-green-900'>
                Desktop Connector is running
              </p>
              <p className='text-sm text-green-700'>
                You can access it at http://localhost:3000
              </p>
            </div>
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='bg-blue-50 border border-blue-200 rounded-lg p-4'>
              <h3 className='font-medium text-blue-900 mb-2'>
                What is the Desktop Connector?
              </h3>
              <p className='text-sm text-blue-800'>
                The Desktop Connector runs locally on your machine and provides:
              </p>
              <ul className='text-sm text-blue-800 mt-2 space-y-1'>
                <li>• Direct access to your local file system</li>
                <li>
                  • Integration with locally installed CLI tools (Claude Code,
                  Gemini CLI)
                </li>
                <li>• Terminal access and process management</li>
                <li>• Offline functionality</li>
              </ul>
            </div>

            <div className='space-y-3'>
              <h4 className='font-medium'>Installation Options:</h4>

              <div className='bg-gray-50 rounded-lg p-4'>
                <h5 className='font-medium mb-2'>
                  Option 1: One-line installer (Recommended)
                </h5>
                <div className='bg-black text-green-400 rounded p-3 font-mono text-sm mb-3'>
                  curl -fsSL {window.location.origin}/install-desktop.sh | bash
                </div>
                <button
                  onClick={copyInstallCommand}
                  className='copy-button bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors'
                >
                  Copy Command
                </button>
              </div>

              <div className='bg-gray-50 rounded-lg p-4'>
                <h5 className='font-medium mb-2'>
                  Option 2: Download installer script
                </h5>
                <p className='text-sm text-gray-600 mb-3'>
                  Download the installer script and run it manually
                </p>
                <button
                  onClick={downloadInstaller}
                  className='bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors inline-flex items-center space-x-2'
                >
                  <Download className='w-4 h-4' />
                  <span>Download install-desktop.sh</span>
                </button>
              </div>

              <div className='bg-gray-50 rounded-lg p-4'>
                <h5 className='font-medium mb-2'>
                  Option 3: Manual installation
                </h5>
                <p className='text-sm text-gray-600 mb-2'>
                  For advanced users who want to build from source:
                </p>
                <a
                  href='https://github.com/your-org/vibe-code#desktop-connector'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-blue-600 hover:text-blue-800 inline-flex items-center space-x-1'
                >
                  <ExternalLink className='w-4 h-4' />
                  <span>View installation guide</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* System Information */}
      {systemInfo && (
        <div className='bg-gray-50 rounded-lg p-6'>
          <h2 className='text-xl font-semibold mb-4'>System Information</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4 text-sm'>
            <div>
              <span className='font-medium'>Backend Type:</span>
              <span className='ml-2 text-gray-600'>{systemInfo.type}</span>
            </div>
            <div>
              <span className='font-medium'>Platform:</span>
              <span className='ml-2 text-gray-600'>{systemInfo.platform}</span>
            </div>
            <div>
              <span className='font-medium'>Version:</span>
              <span className='ml-2 text-gray-600'>{systemInfo.version}</span>
            </div>
            <div>
              <span className='font-medium'>Node Version:</span>
              <span className='ml-2 text-gray-600'>
                {systemInfo.nodeVersion}
              </span>
            </div>
            {systemInfo.rootDirectory && (
              <div className='md:col-span-2'>
                <span className='font-medium'>Root Directory:</span>
                <span className='ml-2 text-gray-600 font-mono text-xs'>
                  {systemInfo.rootDirectory}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className='text-center'>
        <button
          onClick={checkBackendStatus}
          className='bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors'
        >
          Refresh Status
        </button>
      </div>
    </div>
  );
}
