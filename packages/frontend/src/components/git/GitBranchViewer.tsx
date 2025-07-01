import React, { useState } from 'react';
import {
  GitBranch,
  GitMerge,
  Trash2,
  Plus,
  Search,
  GitCommit,
  Clock,
  User,
  CheckCircle,
  XCircle,
  RefreshCw,
  Filter,
  ArrowUpDown,
  MoreVertical,
} from 'lucide-react';

export interface GitBranch {
  name: string;
  fullName: string;
  type: 'local' | 'remote' | 'both';
  current: boolean;
  tracking?: string;
  ahead?: number;
  behind?: number;
  lastCommit: {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
  };
  protected?: boolean;
  merged?: boolean;
}

export interface GitBranchViewerProps {
  branches: GitBranch[];
  loading?: boolean;
  title?: string;
  onBranchSelect?: (branch: GitBranch) => void;
  onBranchCheckout?: (branchName: string) => void;
  onBranchDelete?: (branchName: string) => void;
  onBranchCreate?: (branchName: string, fromBranch?: string) => void;
  onBranchMerge?: (sourceBranch: string, targetBranch: string) => void;
  onRefresh?: () => void;
  selectedBranch?: string;
  showActions?: boolean;
}

const GitBranchViewer: React.FC<GitBranchViewerProps> = ({
  branches,
  loading = false,
  title = 'Git Branches',
  onBranchSelect,
  onBranchCheckout,
  onBranchDelete,
  onBranchCreate,
  onBranchMerge,
  onRefresh,
  selectedBranch,
  showActions = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'local' | 'remote'>(
    'all'
  );
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'author'>('name');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [fromBranch, setFromBranch] = useState('');
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return 'Today';
    } else if (diffDays === 2) {
      return 'Yesterday';
    } else if (diffDays <= 7) {
      return `${diffDays - 1} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getBranchIcon = (branch: GitBranch) => {
    if (branch.current) {
      return <CheckCircle className='w-4 h-4 text-green-500' />;
    }
    if (branch.type === 'remote') {
      return <GitBranch className='w-4 h-4 text-blue-500' />;
    }
    if (branch.merged) {
      return <GitMerge className='w-4 h-4 text-purple-500' />;
    }
    return <GitBranch className='w-4 h-4 text-gray-500' />;
  };

  const getBranchTypeColor = (type: GitBranch['type']) => {
    switch (type) {
      case 'local':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
      case 'remote':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'both':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  };

  // Filter and sort branches
  const filteredBranches = branches
    .filter(branch => {
      if (filterType !== 'all' && !branch.type.includes(filterType)) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          branch.name.toLowerCase().includes(query) ||
          branch.lastCommit.message.toLowerCase().includes(query) ||
          branch.lastCommit.author.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (a.current) return -1;
      if (b.current) return 1;

      switch (sortBy) {
        case 'date':
          return (
            new Date(b.lastCommit.date).getTime() -
            new Date(a.lastCommit.date).getTime()
          );
        case 'author':
          return a.lastCommit.author.localeCompare(b.lastCommit.author);
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

  const handleCreateBranch = () => {
    if (newBranchName.trim() && onBranchCreate) {
      onBranchCreate(newBranchName.trim(), fromBranch || undefined);
      setNewBranchName('');
      setFromBranch('');
      setShowCreateModal(false);
    }
  };

  const localBranches = branches.filter(
    b => b.type === 'local' || b.type === 'both'
  );

  return (
    <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'>
      {/* Header */}
      <div className='bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3'>
        <div className='flex items-center justify-between mb-3'>
          <div className='flex items-center space-x-3'>
            <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
              {title}
            </h3>
            <span className='text-sm text-gray-500 dark:text-gray-400'>
              {branches.length} branch{branches.length !== 1 ? 'es' : ''}
            </span>
          </div>

          <div className='flex items-center space-x-2'>
            {showActions && onBranchCreate && (
              <button
                onClick={() => setShowCreateModal(true)}
                className='flex items-center space-x-1 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm'
              >
                <Plus className='w-4 h-4' />
                <span>New Branch</span>
              </button>
            )}

            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className='p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50'
                title='Refresh'
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        <div className='flex flex-col sm:flex-row gap-3'>
          <div className='flex-1'>
            <div className='relative'>
              <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400' />
              <input
                type='text'
                placeholder='Search branches...'
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className='w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
              />
            </div>
          </div>

          <div className='flex items-center space-x-3'>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as any)}
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            >
              <option value='all'>All Branches</option>
              <option value='local'>Local Only</option>
              <option value='remote'>Remote Only</option>
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            >
              <option value='name'>Sort by Name</option>
              <option value='date'>Sort by Date</option>
              <option value='author'>Sort by Author</option>
            </select>
          </div>
        </div>
      </div>

      {/* Branches List */}
      <div className='max-h-96 overflow-y-auto'>
        {loading && branches.length === 0 ? (
          <div className='flex items-center justify-center p-8'>
            <RefreshCw className='w-6 h-6 animate-spin text-blue-500' />
            <span className='ml-2 text-gray-600 dark:text-gray-400'>
              Loading branches...
            </span>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className='p-8 text-center text-gray-500 dark:text-gray-400'>
            {branches.length === 0
              ? 'No branches found'
              : 'No branches match your filters'}
          </div>
        ) : (
          <div className='divide-y divide-gray-200 dark:divide-gray-700'>
            {filteredBranches.map(branch => (
              <div
                key={branch.fullName}
                className='hover:bg-gray-50 dark:hover:bg-gray-800'
              >
                <div
                  className={`flex items-center p-4 cursor-pointer ${
                    selectedBranch === branch.name
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : ''
                  }`}
                  onClick={() => {
                    onBranchSelect?.(branch);
                    setExpandedBranch(
                      expandedBranch === branch.name ? null : branch.name
                    );
                  }}
                >
                  <div className='flex items-center space-x-3 flex-1 min-w-0'>
                    {getBranchIcon(branch)}

                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center space-x-2 mb-1'>
                        <span
                          className={`font-medium truncate ${
                            branch.current
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-gray-900 dark:text-white'
                          }`}
                        >
                          {branch.name}
                        </span>

                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getBranchTypeColor(branch.type)}`}
                        >
                          {branch.type}
                        </span>

                        {branch.current && (
                          <span className='px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs rounded-full font-medium'>
                            current
                          </span>
                        )}

                        {branch.protected && (
                          <span className='px-2 py-1 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs rounded-full font-medium'>
                            protected
                          </span>
                        )}
                      </div>

                      <div className='flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400'>
                        <div className='flex items-center space-x-1'>
                          <GitCommit className='w-3 h-3' />
                          <span className='truncate max-w-40'>
                            {branch.lastCommit.message}
                          </span>
                        </div>

                        <div className='flex items-center space-x-1'>
                          <User className='w-3 h-3' />
                          <span>{branch.lastCommit.author}</span>
                        </div>

                        <div className='flex items-center space-x-1'>
                          <Clock className='w-3 h-3' />
                          <span>{formatDate(branch.lastCommit.date)}</span>
                        </div>

                        {(branch.ahead || branch.behind) && (
                          <div className='flex items-center space-x-1'>
                            {branch.ahead && (
                              <span className='text-green-600 dark:text-green-400'>
                                ↑{branch.ahead}
                              </span>
                            )}
                            {branch.behind && (
                              <span className='text-red-600 dark:text-red-400'>
                                ↓{branch.behind}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {showActions && (
                    <div className='flex items-center space-x-1 ml-2'>
                      {!branch.current && onBranchCheckout && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onBranchCheckout(branch.name);
                          }}
                          className='px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/40'
                        >
                          Checkout
                        </button>
                      )}

                      {!branch.current &&
                        !branch.protected &&
                        onBranchDelete && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (confirm(`Delete branch "${branch.name}"?`)) {
                                onBranchDelete(branch.name);
                              }
                            }}
                            className='p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                            title='Delete branch'
                          >
                            <Trash2 className='w-3 h-3' />
                          </button>
                        )}

                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setExpandedBranch(
                            expandedBranch === branch.name ? null : branch.name
                          );
                        }}
                        className='p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                      >
                        <MoreVertical className='w-3 h-3' />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Details */}
                {expandedBranch === branch.name && (
                  <div className='px-4 pb-4 bg-gray-50 dark:bg-gray-800'>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                      <div className='space-y-2'>
                        <div className='text-sm'>
                          <span className='font-medium text-gray-900 dark:text-white'>
                            Full Name:
                          </span>
                          <span className='ml-2 font-mono text-gray-600 dark:text-gray-400'>
                            {branch.fullName}
                          </span>
                        </div>

                        {branch.tracking && (
                          <div className='text-sm'>
                            <span className='font-medium text-gray-900 dark:text-white'>
                              Tracking:
                            </span>
                            <span className='ml-2 font-mono text-gray-600 dark:text-gray-400'>
                              {branch.tracking}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className='space-y-2'>
                        <div className='text-sm'>
                          <span className='font-medium text-gray-900 dark:text-white'>
                            Last Commit:
                          </span>
                          <span className='ml-2 font-mono text-gray-600 dark:text-gray-400'>
                            {branch.lastCommit.shortHash}
                          </span>
                        </div>

                        <div className='text-sm'>
                          <span className='font-medium text-gray-900 dark:text-white'>
                            Commit Date:
                          </span>
                          <span className='ml-2 text-gray-600 dark:text-gray-400'>
                            {new Date(branch.lastCommit.date).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Branch Actions */}
                    {showActions && onBranchMerge && !branch.current && (
                      <div className='mt-4 pt-4 border-t border-gray-200 dark:border-gray-700'>
                        <div className='flex items-center space-x-3'>
                          <span className='text-sm font-medium text-gray-900 dark:text-white'>
                            Quick Actions:
                          </span>
                          <button
                            onClick={() => onBranchMerge(branch.name, 'main')}
                            className='px-3 py-1 text-xs bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded hover:bg-purple-200 dark:hover:bg-purple-900/40'
                          >
                            Merge to main
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Branch Modal */}
      {showCreateModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
          <div className='bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md'>
            <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>
              Create New Branch
            </h3>

            <div className='space-y-4'>
              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  Branch Name
                </label>
                <input
                  type='text'
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                  placeholder='feature/new-feature'
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                  autoFocus
                />
              </div>

              <div>
                <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
                  Create from (optional)
                </label>
                <select
                  value={fromBranch}
                  onChange={e => setFromBranch(e.target.value)}
                  className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                >
                  <option value=''>Current branch</option>
                  {localBranches.map(branch => (
                    <option key={branch.name} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className='flex items-center justify-end space-x-3 mt-6'>
              <button
                onClick={() => setShowCreateModal(false)}
                className='px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg'
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim()}
                className='px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GitBranchViewer;
