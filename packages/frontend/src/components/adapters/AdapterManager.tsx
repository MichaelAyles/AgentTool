import React, { useState, useEffect } from 'react';
import {
  Package,
  Search,
  Filter,
  Download,
  Trash2,
  Settings,
  Play,
  Square,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Star,
  Globe,
  Shield,
  Code,
  Tag,
  User,
  Calendar,
  MoreVertical,
  Eye,
  EyeOff,
  Plus,
  ExternalLink,
} from 'lucide-react';

export interface AdapterInfo {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  homepage?: string;
  repository?: string;
  license?: string;
  tags: string[];
  category: 'ai' | 'utility' | 'development' | 'productivity' | 'system' | 'custom';
  status: 'installed' | 'available' | 'updating' | 'error';
  installed?: {
    version: string;
    installedAt: string;
    configuredAt?: string;
    lastUsed?: string;
  };
  capabilities: string[];
  requirements: {
    node?: string;
    system?: string[];
    dependencies?: Record<string, string>;
  };
  configuration?: {
    schema: any;
    current?: any;
    isValid: boolean;
  };
  stats?: {
    downloads: number;
    rating: number;
    reviews: number;
  };
  verified?: boolean;
  official?: boolean;
  experimental?: boolean;
}

export interface AdapterManagerProps {
  adapters: AdapterInfo[];
  loading?: boolean;
  onInstall: (adapterId: string, version?: string) => Promise<void>;
  onUninstall: (adapterId: string) => Promise<void>;
  onUpdate: (adapterId: string) => Promise<void>;
  onConfigure: (adapterId: string) => void;
  onStart: (adapterId: string) => Promise<void>;
  onStop: (adapterId: string) => Promise<void>;
  onRefresh: () => void;
  onViewDetails: (adapter: AdapterInfo) => void;
  onBrowseMarketplace: () => void;
}

const AdapterManager: React.FC<AdapterManagerProps> = ({
  adapters,
  loading = false,
  onInstall,
  onUninstall,
  onUpdate,
  onConfigure,
  onStart,
  onStop,
  onRefresh,
  onViewDetails,
  onBrowseMarketplace,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showExperimental, setShowExperimental] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'downloads' | 'rating' | 'updated'>('name');
  const [expandedAdapter, setExpandedAdapter] = useState<string | null>(null);
  const [operationStates, setOperationStates] = useState<Record<string, 'idle' | 'installing' | 'uninstalling' | 'updating' | 'starting' | 'stopping'>>({});

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'ai', label: 'AI & Machine Learning' },
    { value: 'development', label: 'Development' },
    { value: 'productivity', label: 'Productivity' },
    { value: 'utility', label: 'Utilities' },
    { value: 'system', label: 'System' },
    { value: 'custom', label: 'Custom' },
  ];

  const statuses = [
    { value: 'all', label: 'All Status' },
    { value: 'installed', label: 'Installed' },
    { value: 'available', label: 'Available' },
    { value: 'updating', label: 'Updating' },
    { value: 'error', label: 'Error' },
  ];

  const setOperationState = (adapterId: string, state: typeof operationStates[string]) => {
    setOperationStates(prev => ({ ...prev, [adapterId]: state }));
  };

  const handleInstall = async (adapter: AdapterInfo) => {
    setOperationState(adapter.id, 'installing');
    try {
      await onInstall(adapter.id);
    } finally {
      setOperationState(adapter.id, 'idle');
    }
  };

  const handleUninstall = async (adapter: AdapterInfo) => {
    if (confirm(`Are you sure you want to uninstall "${adapter.displayName}"?`)) {
      setOperationState(adapter.id, 'uninstalling');
      try {
        await onUninstall(adapter.id);
      } finally {
        setOperationState(adapter.id, 'idle');
      }
    }
  };

  const handleUpdate = async (adapter: AdapterInfo) => {
    setOperationState(adapter.id, 'updating');
    try {
      await onUpdate(adapter.id);
    } finally {
      setOperationState(adapter.id, 'idle');
    }
  };

  const handleStart = async (adapter: AdapterInfo) => {
    setOperationState(adapter.id, 'starting');
    try {
      await onStart(adapter.id);
    } finally {
      setOperationState(adapter.id, 'idle');
    }
  };

  const handleStop = async (adapter: AdapterInfo) => {
    setOperationState(adapter.id, 'stopping');
    try {
      await onStop(adapter.id);
    } finally {
      setOperationState(adapter.id, 'idle');
    }
  };

  // Filter and sort adapters
  const filteredAdapters = adapters
    .filter(adapter => {
      if (!showExperimental && adapter.experimental) return false;
      if (selectedCategory !== 'all' && adapter.category !== selectedCategory) return false;
      if (selectedStatus !== 'all' && adapter.status !== selectedStatus) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          adapter.name.toLowerCase().includes(query) ||
          adapter.displayName.toLowerCase().includes(query) ||
          adapter.description.toLowerCase().includes(query) ||
          adapter.tags.some(tag => tag.toLowerCase().includes(query)) ||
          adapter.author.name.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'downloads':
          return (b.stats?.downloads || 0) - (a.stats?.downloads || 0);
        case 'rating':
          return (b.stats?.rating || 0) - (a.stats?.rating || 0);
        case 'updated':
          const aDate = a.installed?.installedAt || a.installed?.configuredAt || '';
          const bDate = b.installed?.installedAt || b.installed?.configuredAt || '';
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        case 'name':
        default:
          return a.displayName.localeCompare(b.displayName);
      }
    });

  const getStatusIcon = (status: AdapterInfo['status']) => {
    switch (status) {
      case 'installed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'updating':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'available':
      default:
        return <Package className="w-4 h-4 text-gray-500" />;
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

  const getCategoryIcon = (category: AdapterInfo['category']) => {
    switch (category) {
      case 'ai':
        return '🤖';
      case 'development':
        return '⚡';
      case 'productivity':
        return '📈';
      case 'utility':
        return '🔧';
      case 'system':
        return '⚙️';
      case 'custom':
        return '🎨';
      default:
        return '📦';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const installedCount = adapters.filter(a => a.status === 'installed').length;
  const availableCount = adapters.filter(a => a.status === 'available').length;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Adapter Manager</h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <span>{installedCount} installed</span>
              <span>•</span>
              <span>{availableCount} available</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={onBrowseMarketplace}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Globe className="w-4 h-4" />
              <span>Browse Marketplace</span>
            </button>
            
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search adapters by name, description, tags, or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map(category => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
            
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {statuses.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="name">Sort by Name</option>
              <option value="downloads">Sort by Downloads</option>
              <option value="rating">Sort by Rating</option>
              <option value="updated">Sort by Updated</option>
            </select>
            
            <button
              onClick={() => setShowExperimental(!showExperimental)}
              className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm ${
                showExperimental
                  ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title={showExperimental ? 'Hide experimental adapters' : 'Show experimental adapters'}
            >
              {showExperimental ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>Experimental</span>
            </button>
          </div>
        </div>
      </div>

      {/* Adapters List */}
      <div className="max-h-96 overflow-y-auto">
        {loading && adapters.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Loading adapters...</span>
          </div>
        ) : filteredAdapters.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            {adapters.length === 0 ? 'No adapters found' : 'No adapters match your filters'}
            {adapters.length === 0 && (
              <div className="mt-4">
                <button
                  onClick={onBrowseMarketplace}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Globe className="w-4 h-4" />
                  <span>Browse Marketplace</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredAdapters.map((adapter) => {
              const isExpanded = expandedAdapter === adapter.id;
              const operationState = operationStates[adapter.id] || 'idle';
              const isOperating = operationState !== 'idle';
              
              return (
                <div key={adapter.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center p-6">
                    <div className="flex-1 min-w-0">
                      {/* Main Info */}
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">{getCategoryIcon(adapter.category)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                              {adapter.displayName}
                            </h3>
                            {adapter.official && (
                              <Shield className="w-4 h-4 text-blue-500" title="Official adapter" />
                            )}
                            {adapter.verified && (
                              <CheckCircle className="w-4 h-4 text-green-500" title="Verified adapter" />
                            )}
                            {adapter.experimental && (
                              <AlertTriangle className="w-4 h-4 text-orange-500" title="Experimental" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {adapter.description}
                          </p>
                        </div>
                      </div>

                      {/* Metadata */}
                      <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mb-2">
                        <div className="flex items-center space-x-1">
                          {getStatusIcon(adapter.status)}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(adapter.status)}`}>
                            {adapter.status}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-1">
                          <Tag className="w-3 h-3" />
                          <span>v{adapter.version}</span>
                        </div>
                        
                        <div className="flex items-center space-x-1">
                          <User className="w-3 h-3" />
                          <span>{adapter.author.name}</span>
                        </div>

                        {adapter.stats && (
                          <>
                            <div className="flex items-center space-x-1">
                              <Download className="w-3 h-3" />
                              <span>{formatNumber(adapter.stats.downloads)}</span>
                            </div>
                            
                            {adapter.stats.rating > 0 && (
                              <div className="flex items-center space-x-1">
                                <Star className="w-3 h-3 text-yellow-500" />
                                <span>{adapter.stats.rating.toFixed(1)}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Tags */}
                      <div className="flex items-center space-x-2 mb-2">
                        {adapter.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                        {adapter.tags.length > 3 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            +{adapter.tags.length - 3} more
                          </span>
                        )}
                      </div>

                      {/* Installation Info */}
                      {adapter.installed && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Installed: {formatDate(adapter.installed.installedAt)}
                          {adapter.installed.lastUsed && (
                            <span className="ml-2">• Last used: {formatDate(adapter.installed.lastUsed)}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 ml-4">
                      {adapter.status === 'installed' ? (
                        <>
                          <button
                            onClick={() => onConfigure(adapter.id)}
                            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            title="Configure"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          
                          <button
                            onClick={() => handleUpdate(adapter)}
                            disabled={isOperating}
                            className="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50"
                          >
                            {operationState === 'updating' ? 'Updating...' : 'Update'}
                          </button>
                          
                          <button
                            onClick={() => handleUninstall(adapter)}
                            disabled={isOperating}
                            className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                            title="Uninstall"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleInstall(adapter)}
                          disabled={isOperating}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                        >
                          {operationState === 'installing' ? 'Installing...' : 'Install'}
                        </button>
                      )}
                      
                      <button
                        onClick={() => onViewDetails(adapter)}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        title="View Details"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdapterManager;