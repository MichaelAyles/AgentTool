import React, { useState } from 'react';
import {
  Package,
  Star,
  Download,
  User,
  Calendar,
  Globe,
  Github,
  Tag,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Play,
  Square,
  Trash2,
  ExternalLink,
  Copy,
  Code,
  FileText,
  Book,
  Bug,
  Heart,
  MessageSquare,
  TrendingUp,
  Clock,
  Zap,
  HardDrive,
  Cpu,
  Network,
} from 'lucide-react';
import { AdapterInfo } from './AdapterManager';

export interface AdapterDetailsProps {
  adapter: AdapterInfo;
  onInstall: (adapterId: string, version?: string) => Promise<void>;
  onUninstall: (adapterId: string) => Promise<void>;
  onUpdate: (adapterId: string) => Promise<void>;
  onConfigure: (adapterId: string) => void;
  onStart: (adapterId: string) => Promise<void>;
  onStop: (adapterId: string) => Promise<void>;
  onClose: () => void;
  loading?: boolean;
}

const AdapterDetails: React.FC<AdapterDetailsProps> = ({
  adapter,
  onInstall,
  onUninstall,
  onUpdate,
  onConfigure,
  onStart,
  onStop,
  onClose,
  loading = false,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'configuration' | 'documentation' | 'changelog'>('overview');
  const [operationState, setOperationState] = useState<'idle' | 'installing' | 'uninstalling' | 'updating' | 'starting' | 'stopping'>('idle');

  const handleOperation = async (operation: () => Promise<void>, state: typeof operationState) => {
    setOperationState(state);
    try {
      await operation();
    } finally {
      setOperationState('idle');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getStatusIcon = (status: AdapterInfo['status']) => {
    switch (status) {
      case 'installed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'updating':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'available':
      default:
        return <Package className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: AdapterInfo['status']) => {
    switch (status) {
      case 'installed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'updating':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'available':
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  const isOperating = operationState !== 'idle';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl h-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="text-4xl">
                {adapter.category === 'ai' ? '🤖' :
                 adapter.category === 'development' ? '⚡' :
                 adapter.category === 'productivity' ? '📈' :
                 adapter.category === 'utility' ? '🔧' :
                 adapter.category === 'system' ? '⚙️' :
                 adapter.category === 'custom' ? '🎨' : '📦'}
              </div>
              
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {adapter.displayName}
                  </h1>
                  {adapter.official && (
                    <Shield className="w-5 h-5 text-blue-500" title="Official adapter" />
                  )}
                  {adapter.verified && (
                    <CheckCircle className="w-5 h-5 text-green-500" title="Verified adapter" />
                  )}
                  {adapter.experimental && (
                    <AlertTriangle className="w-5 h-5 text-orange-500" title="Experimental" />
                  )}
                </div>
                
                <p className="text-gray-600 dark:text-gray-400 mb-3 max-w-2xl">
                  {adapter.description}
                </p>
                
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-1">
                    {getStatusIcon(adapter.status)}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(adapter.status)}`}>
                      {adapter.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                    <Tag className="w-4 h-4" />
                    <span>v{adapter.version}</span>
                  </div>
                  
                  <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                    <User className="w-4 h-4" />
                    <span>{adapter.author.name}</span>
                  </div>

                  {adapter.stats && (
                    <>
                      <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                        <Download className="w-4 h-4" />
                        <span>{formatNumber(adapter.stats.downloads)}</span>
                      </div>
                      
                      {adapter.stats.rating > 0 && (
                        <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span>{adapter.stats.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Action Buttons */}
              {adapter.status === 'installed' ? (
                <>
                  <button
                    onClick={() => onConfigure(adapter.id)}
                    className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Configure</span>
                  </button>
                  
                  <button
                    onClick={() => handleOperation(() => onUpdate(adapter.id), 'updating')}
                    disabled={isOperating}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{operationState === 'updating' ? 'Updating...' : 'Update'}</span>
                  </button>
                  
                  <button
                    onClick={() => handleOperation(() => onUninstall(adapter.id), 'uninstalling')}
                    disabled={isOperating}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{operationState === 'uninstalling' ? 'Uninstalling...' : 'Uninstall'}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleOperation(() => onInstall(adapter.id), 'installing')}
                  disabled={isOperating}
                  className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{operationState === 'installing' ? 'Installing...' : 'Install'}</span>
                </button>
              )}
              
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {[
              { id: 'overview', label: 'Overview', icon: FileText },
              { id: 'configuration', label: 'Configuration', icon: Settings },
              { id: 'documentation', label: 'Documentation', icon: Book },
              { id: 'changelog', label: 'Changelog', icon: Clock },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 py-3 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Installation Info */}
              {adapter.installed && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200 mb-2">
                    Installation Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Installed Version:</span>
                      <span className="ml-2">{adapter.installed.version}</span>
                    </div>
                    <div>
                      <span className="font-medium">Installed:</span>
                      <span className="ml-2">{formatDate(adapter.installed.installedAt)}</span>
                    </div>
                    {adapter.installed.lastUsed && (
                      <div>
                        <span className="font-medium">Last Used:</span>
                        <span className="ml-2">{formatDate(adapter.installed.lastUsed)}</span>
                      </div>
                    )}
                    {adapter.installed.configuredAt && (
                      <div>
                        <span className="font-medium">Configured:</span>
                        <span className="ml-2">{formatDate(adapter.installed.configuredAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Author & Links */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Author Information
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span>{adapter.author.name}</span>
                      {adapter.author.email && (
                        <button
                          onClick={() => copyToClipboard(adapter.author.email)}
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {adapter.license && (
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span>{adapter.license}</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Links & Resources
                  </h3>
                  <div className="space-y-2">
                    {adapter.homepage && (
                      <a
                        href={adapter.homepage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Globe className="w-4 h-4" />
                        <span>Homepage</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {adapter.repository && (
                      <a
                        href={adapter.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Github className="w-4 h-4" />
                        <span>Repository</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Capabilities */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Capabilities
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {adapter.capabilities.map((capability) => (
                    <div
                      key={capability}
                      className="flex items-center space-x-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
                    >
                      <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm text-blue-800 dark:text-blue-300">{capability}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Requirements */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  System Requirements
                </h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {adapter.requirements.node && (
                      <div className="flex items-center space-x-2">
                        <Code className="w-4 h-4 text-gray-500" />
                        <span>Node.js: {adapter.requirements.node}</span>
                      </div>
                    )}
                    {adapter.requirements.system && adapter.requirements.system.length > 0 && (
                      <div className="flex items-start space-x-2">
                        <Cpu className="w-4 h-4 text-gray-500 mt-0.5" />
                        <div>
                          <span className="font-medium">System:</span>
                          <ul className="list-disc list-inside ml-2">
                            {adapter.requirements.system.map((req, index) => (
                              <li key={index}>{req}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {adapter.requirements.dependencies && Object.keys(adapter.requirements.dependencies).length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Dependencies:</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(adapter.requirements.dependencies).map(([dep, version]) => (
                          <div key={dep} className="flex items-center justify-between text-xs">
                            <span className="font-mono">{dep}</span>
                            <span className="text-gray-500">{version}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {adapter.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Statistics */}
              {adapter.stats && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Statistics
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Downloads</span>
                      </div>
                      <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {formatNumber(adapter.stats.downloads)}
                      </div>
                    </div>
                    
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        <Star className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                        <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Rating</span>
                      </div>
                      <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                        {adapter.stats.rating.toFixed(1)}
                      </div>
                    </div>
                    
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <div className="flex items-center space-x-2 mb-1">
                        <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
                        <span className="text-sm font-medium text-green-800 dark:text-green-300">Reviews</span>
                      </div>
                      <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                        {formatNumber(adapter.stats.reviews)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'configuration' && (
            <div className="space-y-6">
              {adapter.configuration ? (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Configuration Schema
                  </h3>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-sm overflow-x-auto">
                    {JSON.stringify(adapter.configuration.schema, null, 2)}
                  </pre>
                  
                  {adapter.configuration.current && (
                    <div className="mt-4">
                      <h4 className="font-medium text-gray-900 dark:text-white mb-2">Current Configuration:</h4>
                      <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg text-sm overflow-x-auto">
                        {JSON.stringify(adapter.configuration.current, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No configuration schema available
                </div>
              )}
            </div>
          )}

          {activeTab === 'documentation' && (
            <div className="space-y-6">
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Book className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Documentation</h3>
                <p>Documentation will be loaded from the adapter's repository or homepage.</p>
                {adapter.homepage && (
                  <a
                    href={adapter.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 mt-4 text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>View Documentation</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          )}

          {activeTab === 'changelog' && (
            <div className="space-y-6">
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Clock className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">Changelog</h3>
                <p>Version history and changelog will be displayed here.</p>
                {adapter.repository && (
                  <a
                    href={`${adapter.repository}/releases`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 mt-4 text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <span>View Releases</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdapterDetails;