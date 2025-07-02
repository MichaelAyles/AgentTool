import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocalAgentConnector } from '../components/connection';
import { ArrowLeft, ExternalLink } from 'lucide-react';

export const LocalAgentConnection: React.FC = () => {
  const navigate = useNavigate();
  const [connectedUrl, setConnectedUrl] = useState<string | null>(null);

  const handleConnection = (tunnelUrl: string) => {
    setConnectedUrl(tunnelUrl);
    // Here you could also redirect to a terminal session or store the URL for later use
    console.log('Local agent connected:', tunnelUrl);
  };

  const openTunnelUrl = () => {
    if (connectedUrl) {
      window.open(connectedUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </button>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Local Agent Connection
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Connect your local machine to enable terminal interaction through this web interface.
            </p>
          </div>
        </div>

        {/* Connection Component */}
        <div className="space-y-6">
          <LocalAgentConnector 
            onConnection={handleConnection}
            className="max-w-2xl mx-auto"
          />

          {/* Connected Actions */}
          {connectedUrl && (
            <div className="max-w-2xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                What's Next?
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div>
                    <h4 className="font-medium text-green-800 dark:text-green-200">
                      Local Agent Connected
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Your local machine is now accessible through this web interface.
                    </p>
                  </div>
                  <button
                    onClick={openTunnelUrl}
                    className="flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Terminal
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => navigate('/terminal/local')}
                    className="p-4 text-left border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Start Coding Session
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Open an integrated terminal with your AI assistant
                    </p>
                  </button>

                  <button
                    onClick={() => navigate('/projects')}
                    className="p-4 text-left border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Manage Projects
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Create or open projects on your local machine
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Help Section */}
          <div className="max-w-2xl mx-auto bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-4">
              Need Help?
            </h3>
            
            <div className="space-y-3 text-sm text-blue-700 dark:text-blue-300">
              <div>
                <strong>Troubleshooting:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Make sure you have internet connectivity</li>
                  <li>Check that your firewall allows outbound HTTPS connections</li>
                  <li>Ensure you have sufficient permissions to install software</li>
                  <li>Try running the command with sudo if permission denied</li>
                </ul>
              </div>
              
              <div>
                <strong>Security:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>The connection uses HTTPS encryption</li>
                  <li>Sessions automatically expire after 5 minutes</li>
                  <li>Only you can access your local machine through this session</li>
                  <li>No persistent access is maintained after session end</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};