import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  GitCommit,
  GitMerge,
  User,
  Calendar,
  Hash,
  FileText,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  Tag,
  ArrowRight,
} from 'lucide-react';

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer?: {
    name: string;
    email: string;
    date: string;
  };
  parents: string[];
  refs?: string[];
  tags?: string[];
  stats?: {
    files: number;
    additions: number;
    deletions: number;
  };
  files?: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    additions: number;
    deletions: number;
  }>;
}

export interface GitHistoryProps {
  commits: GitCommit[];
  loading?: boolean;
  title?: string;
  branch?: string;
  onCommitSelect?: (commit: GitCommit) => void;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  selectedCommit?: string;
  showFiles?: boolean;
}

const GitHistoryViewer: React.FC<GitHistoryProps> = ({
  commits,
  loading = false,
  title = 'Git History',
  branch,
  onCommitSelect,
  onRefresh,
  onLoadMore,
  hasMore = false,
  selectedCommit,
  showFiles = true,
}) => {
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [showMergeCommits, setShowMergeCommits] = useState(true);

  const toggleCommitExpansion = (commitHash: string) => {
    const newExpanded = new Set(expandedCommits);
    if (newExpanded.has(commitHash)) {
      newExpanded.delete(commitHash);
    } else {
      newExpanded.add(commitHash);
    }
    setExpandedCommits(newExpanded);
  };

  const copyCommitHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
  };

  const getCommitIcon = (commit: GitCommit) => {
    if (commit.parents.length > 1) {
      return <GitMerge className='w-4 h-4 text-purple-500' />;
    }
    if (commit.tags && commit.tags.length > 0) {
      return <Tag className='w-4 h-4 text-orange-500' />;
    }
    return <GitCommit className='w-4 h-4 text-blue-500' />;
  };

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

  const getAuthorInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'added':
        return 'text-green-600 dark:text-green-400';
      case 'deleted':
        return 'text-red-600 dark:text-red-400';
      case 'modified':
        return 'text-blue-600 dark:text-blue-400';
      case 'renamed':
        return 'text-purple-600 dark:text-purple-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Filter commits based on search and filters
  const filteredCommits = commits.filter(commit => {
    if (!showMergeCommits && commit.parents.length > 1) {
      return false;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !commit.message.toLowerCase().includes(query) &&
        !commit.hash.toLowerCase().includes(query) &&
        !commit.author.name.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    if (
      authorFilter &&
      !commit.author.name.toLowerCase().includes(authorFilter.toLowerCase())
    ) {
      return false;
    }

    return true;
  });

  const uniqueAuthors = Array.from(new Set(commits.map(c => c.author.name)));

  return (
    <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'>
      {/* Header */}
      <div className='bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3'>
        <div className='flex items-center justify-between mb-3'>
          <div className='flex items-center space-x-3'>
            <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>
              {title}
            </h3>
            {branch && (
              <div className='flex items-center space-x-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 rounded-full'>
                <GitBranch className='w-3 h-3 text-blue-600 dark:text-blue-400' />
                <span className='text-xs font-medium text-blue-600 dark:text-blue-400'>
                  {branch}
                </span>
              </div>
            )}
          </div>

          <div className='flex items-center space-x-2'>
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
                placeholder='Search commits, messages, or authors...'
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className='w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
              />
            </div>
          </div>

          <div className='flex items-center space-x-3'>
            <select
              value={authorFilter}
              onChange={e => setAuthorFilter(e.target.value)}
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            >
              <option value=''>All Authors</option>
              {uniqueAuthors.map(author => (
                <option key={author} value={author}>
                  {author}
                </option>
              ))}
            </select>

            <label className='flex items-center text-sm text-gray-600 dark:text-gray-400'>
              <input
                type='checkbox'
                checked={showMergeCommits}
                onChange={e => setShowMergeCommits(e.target.checked)}
                className='mr-2'
              />
              Merges
            </label>
          </div>
        </div>
      </div>

      {/* Commits List */}
      <div className='max-h-96 overflow-y-auto'>
        {loading && commits.length === 0 ? (
          <div className='flex items-center justify-center p-8'>
            <RefreshCw className='w-6 h-6 animate-spin text-blue-500' />
            <span className='ml-2 text-gray-600 dark:text-gray-400'>
              Loading commits...
            </span>
          </div>
        ) : filteredCommits.length === 0 ? (
          <div className='p-8 text-center text-gray-500 dark:text-gray-400'>
            {commits.length === 0
              ? 'No commits found'
              : 'No commits match your filters'}
          </div>
        ) : (
          <div className='divide-y divide-gray-200 dark:divide-gray-700'>
            {filteredCommits.map(commit => (
              <div
                key={commit.hash}
                className='hover:bg-gray-50 dark:hover:bg-gray-800'
              >
                {/* Commit Header */}
                <div
                  className={`flex items-center p-4 cursor-pointer ${
                    selectedCommit === commit.hash
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : ''
                  }`}
                  onClick={() => {
                    toggleCommitExpansion(commit.hash);
                    onCommitSelect?.(commit);
                  }}
                >
                  <div className='flex items-center space-x-3 flex-1 min-w-0'>
                    <button className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'>
                      {expandedCommits.has(commit.hash) ? (
                        <ChevronDown className='w-4 h-4' />
                      ) : (
                        <ChevronRight className='w-4 h-4' />
                      )}
                    </button>

                    {getCommitIcon(commit)}

                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center space-x-2 mb-1'>
                        <span className='font-medium text-gray-900 dark:text-white truncate'>
                          {commit.message.split('\n')[0]}
                        </span>
                        {commit.tags && commit.tags.length > 0 && (
                          <div className='flex items-center space-x-1'>
                            {commit.tags.map(tag => (
                              <span
                                key={tag}
                                className='px-2 py-1 bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-xs rounded-full font-medium'
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className='flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400'>
                        <div className='flex items-center space-x-1'>
                          <div className='w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300'>
                            {getAuthorInitials(commit.author.name)}
                          </div>
                          <span>{commit.author.name}</span>
                        </div>

                        <span>{formatDate(commit.author.date)}</span>

                        <div className='flex items-center space-x-1'>
                          <Hash className='w-3 h-3' />
                          <span className='font-mono'>{commit.shortHash}</span>
                        </div>

                        {commit.stats && (
                          <div className='flex items-center space-x-2'>
                            <span className='text-green-600 dark:text-green-400'>
                              +{commit.stats.additions}
                            </span>
                            <span className='text-red-600 dark:text-red-400'>
                              -{commit.stats.deletions}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className='flex items-center space-x-1 ml-2'>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        copyCommitHash(commit.hash);
                      }}
                      className='p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                      title='Copy hash'
                    >
                      <Copy className='w-3 h-3' />
                    </button>
                  </div>
                </div>

                {/* Expanded Commit Details */}
                {expandedCommits.has(commit.hash) && (
                  <div className='px-4 pb-4 bg-gray-50 dark:bg-gray-800'>
                    {/* Full Message */}
                    {commit.message.includes('\n') && (
                      <div className='mb-4'>
                        <h4 className='text-sm font-medium text-gray-900 dark:text-white mb-2'>
                          Full Message
                        </h4>
                        <pre className='text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-white dark:bg-gray-900 p-3 rounded border'>
                          {commit.message}
                        </pre>
                      </div>
                    )}

                    {/* Commit Details */}
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mb-4'>
                      <div className='space-y-2'>
                        <div className='flex items-center space-x-2 text-sm'>
                          <User className='w-4 h-4 text-gray-400' />
                          <span className='font-medium text-gray-900 dark:text-white'>
                            Author:
                          </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {commit.author.name} &lt;{commit.author.email}&gt;
                          </span>
                        </div>

                        <div className='flex items-center space-x-2 text-sm'>
                          <Calendar className='w-4 h-4 text-gray-400' />
                          <span className='font-medium text-gray-900 dark:text-white'>
                            Date:
                          </span>
                          <span className='text-gray-600 dark:text-gray-400'>
                            {new Date(commit.author.date).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className='space-y-2'>
                        <div className='flex items-center space-x-2 text-sm'>
                          <Hash className='w-4 h-4 text-gray-400' />
                          <span className='font-medium text-gray-900 dark:text-white'>
                            Hash:
                          </span>
                          <span className='font-mono text-gray-600 dark:text-gray-400'>
                            {commit.hash}
                          </span>
                        </div>

                        {commit.parents.length > 0 && (
                          <div className='flex items-center space-x-2 text-sm'>
                            <ArrowRight className='w-4 h-4 text-gray-400' />
                            <span className='font-medium text-gray-900 dark:text-white'>
                              Parents:
                            </span>
                            <div className='flex space-x-1'>
                              {commit.parents.map(parent => (
                                <span
                                  key={parent}
                                  className='font-mono text-gray-600 dark:text-gray-400'
                                >
                                  {parent.slice(0, 7)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Changed Files */}
                    {showFiles && commit.files && commit.files.length > 0 && (
                      <div>
                        <h4 className='text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center'>
                          <FileText className='w-4 h-4 mr-1' />
                          Changed Files ({commit.files.length})
                        </h4>
                        <div className='space-y-1'>
                          {commit.files.map((file, index) => (
                            <div
                              key={index}
                              className='flex items-center justify-between p-2 bg-white dark:bg-gray-900 rounded border text-sm'
                            >
                              <div className='flex items-center space-x-2 flex-1 min-w-0'>
                                <span
                                  className={`font-medium ${getStatusColor(file.status)}`}
                                >
                                  {file.status.charAt(0).toUpperCase()}
                                </span>
                                <span className='font-mono text-gray-900 dark:text-white truncate'>
                                  {file.path}
                                </span>
                              </div>

                              <div className='flex items-center space-x-2 text-xs'>
                                {file.additions > 0 && (
                                  <span className='text-green-600 dark:text-green-400'>
                                    +{file.additions}
                                  </span>
                                )}
                                {file.deletions > 0 && (
                                  <span className='text-red-600 dark:text-red-400'>
                                    -{file.deletions}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && (
          <div className='p-4 border-t border-gray-200 dark:border-gray-700'>
            <button
              onClick={onLoadMore}
              className='w-full py-2 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors'
            >
              Load More Commits
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHistoryViewer;
