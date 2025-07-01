import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  GitCommit,
  FileText,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import GitDiffViewer, { GitDiffFile } from './GitDiffViewer';
import GitHistoryViewer, {
  GitCommit as GitCommitType,
} from './GitHistoryViewer';
import GitBranchViewer, { GitBranch as GitBranchType } from './GitBranchViewer';

export interface GitVisualizationDashboardProps {
  // Data props
  branches?: GitBranchType[];
  commits?: GitCommitType[];
  diffFiles?: GitDiffFile[];

  // Loading states
  branchesLoading?: boolean;
  commitsLoading?: boolean;
  diffLoading?: boolean;

  // Event handlers
  onRefreshBranches?: () => void;
  onRefreshCommits?: () => void;
  onRefreshDiff?: () => void;

  // Git operations
  onBranchCheckout?: (branchName: string) => void;
  onBranchDelete?: (branchName: string) => void;
  onBranchCreate?: (branchName: string, fromBranch?: string) => void;
  onBranchMerge?: (sourceBranch: string, targetBranch: string) => void;

  // Commit operations
  onCommitSelect?: (commit: GitCommitType) => void;
  onLoadMoreCommits?: () => void;
  hasMoreCommits?: boolean;

  // Diff operations
  onFileSelect?: (file: GitDiffFile) => void;

  // Configuration
  defaultLayout?: 'horizontal' | 'vertical' | 'tabs';
  showBranches?: boolean;
  showHistory?: boolean;
  showDiff?: boolean;
  title?: string;
  currentBranch?: string;
}

type ViewType = 'branches' | 'history' | 'diff';
type LayoutType = 'horizontal' | 'vertical' | 'tabs';

const GitVisualizationDashboard: React.FC<GitVisualizationDashboardProps> = ({
  branches = [],
  commits = [],
  diffFiles = [],
  branchesLoading = false,
  commitsLoading = false,
  diffLoading = false,
  onRefreshBranches,
  onRefreshCommits,
  onRefreshDiff,
  onBranchCheckout,
  onBranchDelete,
  onBranchCreate,
  onBranchMerge,
  onCommitSelect,
  onLoadMoreCommits,
  hasMoreCommits = false,
  onFileSelect,
  defaultLayout = 'tabs',
  showBranches = true,
  showHistory = true,
  showDiff = true,
  title = 'Git Visualization',
  currentBranch,
}) => {
  const [layout, setLayout] = useState<LayoutType>(defaultLayout);
  const [activeTab, setActiveTab] = useState<ViewType>('branches');
  const [hiddenViews, setHiddenViews] = useState<Set<ViewType>>(new Set());
  const [maximizedView, setMaximizedView] = useState<ViewType | null>(null);

  // Auto-select first available tab
  useEffect(() => {
    if (!showBranches && !showHistory && !showDiff) return;

    const availableViews: ViewType[] = [];
    if (showBranches) availableViews.push('branches');
    if (showHistory) availableViews.push('history');
    if (showDiff) availableViews.push('diff');

    if (availableViews.length > 0 && !availableViews.includes(activeTab)) {
      setActiveTab(availableViews[0]);
    }
  }, [showBranches, showHistory, showDiff, activeTab]);

  const toggleViewVisibility = (view: ViewType) => {
    const newHidden = new Set(hiddenViews);
    if (newHidden.has(view)) {
      newHidden.delete(view);
    } else {
      newHidden.add(view);
    }
    setHiddenViews(newHidden);
  };

  const toggleMaximize = (view: ViewType) => {
    setMaximizedView(maximizedView === view ? null : view);
  };

  const refreshAll = () => {
    onRefreshBranches?.();
    onRefreshCommits?.();
    onRefreshDiff?.();
  };

  const getViewTitle = (view: ViewType) => {
    switch (view) {
      case 'branches':
        return `Branches (${branches.length})`;
      case 'history':
        return `History (${commits.length})`;
      case 'diff':
        return `Changes (${diffFiles.length})`;
    }
  };

  const renderView = (view: ViewType) => {
    switch (view) {
      case 'branches':
        if (!showBranches) return null;
        return (
          <GitBranchViewer
            branches={branches}
            loading={branchesLoading}
            title='Branches'
            onBranchSelect={onCommitSelect as any}
            onBranchCheckout={onBranchCheckout}
            onBranchDelete={onBranchDelete}
            onBranchCreate={onBranchCreate}
            onBranchMerge={onBranchMerge}
            onRefresh={onRefreshBranches}
            selectedBranch={currentBranch}
            showActions={true}
          />
        );

      case 'history':
        if (!showHistory) return null;
        return (
          <GitHistoryViewer
            commits={commits}
            loading={commitsLoading}
            title='Commit History'
            branch={currentBranch}
            onCommitSelect={onCommitSelect}
            onRefresh={onRefreshCommits}
            onLoadMore={onLoadMoreCommits}
            hasMore={hasMoreCommits}
            showFiles={true}
          />
        );

      case 'diff':
        if (!showDiff) return null;
        return (
          <GitDiffViewer
            files={diffFiles}
            loading={diffLoading}
            title='Working Directory Changes'
            onRefresh={onRefreshDiff}
            onFileSelect={onFileSelect}
            collapsible={true}
          />
        );

      default:
        return null;
    }
  };

  const availableViews: ViewType[] = [];
  if (showBranches) availableViews.push('branches');
  if (showHistory) availableViews.push('history');
  if (showDiff) availableViews.push('diff');

  const visibleViews = availableViews.filter(view => !hiddenViews.has(view));

  if (availableViews.length === 0) {
    return (
      <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center'>
        <GitBranch className='w-12 h-12 text-gray-400 mx-auto mb-4' />
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-2'>
          No Git Views Enabled
        </h3>
        <p className='text-gray-500 dark:text-gray-400'>
          Enable at least one view (branches, history, or diff) to display git
          information.
        </p>
      </div>
    );
  }

  return (
    <div className='bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'>
      {/* Header */}
      <div className='bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center space-x-3'>
            <h2 className='text-lg font-semibold text-gray-900 dark:text-white'>
              {title}
            </h2>
            {currentBranch && (
              <div className='flex items-center space-x-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/20 rounded-full'>
                <GitBranch className='w-3 h-3 text-blue-600 dark:text-blue-400' />
                <span className='text-xs font-medium text-blue-600 dark:text-blue-400'>
                  {currentBranch}
                </span>
              </div>
            )}
          </div>

          <div className='flex items-center space-x-2'>
            {/* Layout Selector */}
            <div className='flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden'>
              <button
                onClick={() => setLayout('tabs')}
                className={`px-3 py-1 text-xs ${
                  layout === 'tabs'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title='Tab Layout'
              >
                Tabs
              </button>
              <button
                onClick={() => setLayout('horizontal')}
                className={`px-3 py-1 text-xs border-l border-gray-300 dark:border-gray-600 ${
                  layout === 'horizontal'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title='Horizontal Split'
              >
                Split
              </button>
              <button
                onClick={() => setLayout('vertical')}
                className={`px-3 py-1 text-xs border-l border-gray-300 dark:border-gray-600 ${
                  layout === 'vertical'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
                title='Vertical Split'
              >
                Stack
              </button>
            </div>

            {/* View Toggles */}
            <div className='flex items-center space-x-1'>
              {availableViews.map(view => (
                <button
                  key={view}
                  onClick={() => toggleViewVisibility(view)}
                  className={`p-1 rounded ${
                    hiddenViews.has(view)
                      ? 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100'
                  }`}
                  title={`${hiddenViews.has(view) ? 'Show' : 'Hide'} ${view}`}
                >
                  {hiddenViews.has(view) ? (
                    <EyeOff className='w-4 h-4' />
                  ) : (
                    <Eye className='w-4 h-4' />
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={refreshAll}
              className='p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              title='Refresh All'
            >
              <RefreshCw className='w-4 h-4' />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className='relative'>
        {layout === 'tabs' ? (
          <>
            {/* Tab Headers */}
            <div className='border-b border-gray-200 dark:border-gray-700'>
              <nav className='flex space-x-8 px-4' aria-label='Tabs'>
                {visibleViews.map(view => (
                  <button
                    key={view}
                    onClick={() => setActiveTab(view)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                      activeTab === view
                        ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    {getViewTitle(view)}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            <div className='p-4'>{renderView(activeTab)}</div>
          </>
        ) : (
          /* Split Layout */
          <div
            className={`p-4 ${layout === 'horizontal' ? 'flex flex-row space-x-4' : 'flex flex-col space-y-4'}`}
          >
            {visibleViews.map(view => (
              <div
                key={view}
                className={`${maximizedView && maximizedView !== view ? 'hidden' : ''} ${
                  layout === 'horizontal' ? 'flex-1 min-w-0' : 'flex-1'
                }`}
              >
                <div className='relative'>
                  {/* View Header */}
                  <div className='flex items-center justify-between mb-3'>
                    <h3 className='text-md font-medium text-gray-900 dark:text-white'>
                      {getViewTitle(view)}
                    </h3>
                    <button
                      onClick={() => toggleMaximize(view)}
                      className='p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                      title={maximizedView === view ? 'Restore' : 'Maximize'}
                    >
                      {maximizedView === view ? (
                        <Minimize2 className='w-4 h-4' />
                      ) : (
                        <Maximize2 className='w-4 h-4' />
                      )}
                    </button>
                  </div>

                  {renderView(view)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty State */}
      {visibleViews.length === 0 && (
        <div className='p-8 text-center'>
          <EyeOff className='w-12 h-12 text-gray-400 mx-auto mb-4' />
          <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-2'>
            All Views Hidden
          </h3>
          <p className='text-gray-500 dark:text-gray-400 mb-4'>
            All git views are currently hidden. Use the eye icons above to show
            them.
          </p>
          <div className='flex items-center justify-center space-x-2'>
            {availableViews.map(view => (
              <button
                key={view}
                onClick={() => toggleViewVisibility(view)}
                className='px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm'
              >
                Show {view}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GitVisualizationDashboard;
