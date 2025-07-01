import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Minus,
  RotateCcw,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  RefreshCw,
} from 'lucide-react';

export interface GitDiffLine {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  isHunk?: boolean;
}

export interface GitDiffFile {
  path: string;
  oldPath?: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied';
  additions: number;
  deletions: number;
  lines: GitDiffLine[];
  binary?: boolean;
}

export interface GitDiffProps {
  files: GitDiffFile[];
  title?: string;
  loading?: boolean;
  onRefresh?: () => void;
  onFileSelect?: (file: GitDiffFile) => void;
  selectedFile?: string;
  collapsible?: boolean;
}

const GitDiffViewer: React.FC<GitDiffProps> = ({
  files,
  title = 'Git Diff',
  loading = false,
  onRefresh,
  onFileSelect,
  selectedFile,
  collapsible = true,
}) => {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [onlyChanges, setOnlyChanges] = useState(false);

  // Auto-expand files on load
  useEffect(() => {
    if (files.length > 0 && files.length <= 5) {
      setExpandedFiles(new Set(files.map(f => f.path)));
    }
  }, [files]);

  const toggleFileExpansion = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  const getFileStatusIcon = (status: GitDiffFile['status']) => {
    switch (status) {
      case 'added':
        return <Plus className="w-4 h-4 text-green-500" />;
      case 'deleted':
        return <Minus className="w-4 h-4 text-red-500" />;
      case 'modified':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'renamed':
        return <RotateCcw className="w-4 h-4 text-purple-500" />;
      case 'copied':
        return <Copy className="w-4 h-4 text-orange-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-500" />;
    }
  };

  const getFileStatusColor = (status: GitDiffFile['status']) => {
    switch (status) {
      case 'added':
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20';
      case 'deleted':
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
      case 'modified':
        return 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20';
      case 'renamed':
        return 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/20';
      case 'copied':
        return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/20';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/20';
    }
  };

  const getLineTypeClass = (line: GitDiffLine) => {
    switch (line.type) {
      case 'addition':
        return 'bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500';
      case 'deletion':
        return 'bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500';
      case 'header':
        return 'bg-gray-100 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300';
      default:
        return 'bg-white dark:bg-gray-900';
    }
  };

  const copyFileContent = (file: GitDiffFile) => {
    const content = file.lines.map(line => line.content).join('\n');
    navigator.clipboard.writeText(content).then(() => {
      // Could add a toast notification here
    });
  };

  const downloadFile = (file: GitDiffFile) => {
    const content = file.lines.map(line => line.content).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.path.replace('/', '_')}_diff.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLines = (lines: GitDiffLine[]) => {
    if (!onlyChanges) return lines;
    return lines.filter(line => line.type !== 'context');
  };

  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Loading diff...</span>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <div className="flex items-center space-x-2 text-sm">
              <span className="text-green-600 dark:text-green-400">+{totalAdditions}</span>
              <span className="text-red-600 dark:text-red-400">-{totalDeletions}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {files.length} file{files.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-4 mt-3 text-sm">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showLineNumbers}
              onChange={(e) => setShowLineNumbers(e.target.checked)}
              className="mr-2"
            />
            Line Numbers
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={wordWrap}
              onChange={(e) => setWordWrap(e.target.checked)}
              className="mr-2"
            />
            Word Wrap
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={onlyChanges}
              onChange={(e) => setOnlyChanges(e.target.checked)}
              className="mr-2"
            />
            Only Changes
          </label>
        </div>
      </div>

      {/* File List */}
      <div className="max-h-96 overflow-y-auto">
        {files.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No changes to display
          </div>
        ) : (
          files.map((file) => (
            <div key={file.path} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
              {/* File Header */}
              <div
                className={`flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750 ${
                  selectedFile === file.path ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={() => {
                  if (collapsible) {
                    toggleFileExpansion(file.path);
                  }
                  onFileSelect?.(file);
                }}
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  {collapsible && (
                    <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                      {expandedFiles.has(file.path) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  
                  {getFileStatusIcon(file.status)}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm text-gray-900 dark:text-white truncate">
                        {file.path}
                      </span>
                      {file.oldPath && file.oldPath !== file.path && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ← {file.oldPath}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getFileStatusColor(file.status)}`}>
                        {file.status}
                      </span>
                      {file.binary ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">Binary file</span>
                      ) : (
                        <div className="flex items-center space-x-2 text-xs">
                          {file.additions > 0 && (
                            <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
                          )}
                          {file.deletions > 0 && (
                            <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 ml-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyFileContent(file);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title="Copy"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadFile(file);
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* File Content */}
              {(!collapsible || expandedFiles.has(file.path)) && !file.binary && (
                <div className="bg-white dark:bg-gray-900">
                  <div className="font-mono text-sm">
                    {filteredLines(file.lines).map((line, lineIndex) => (
                      <div
                        key={lineIndex}
                        className={`flex ${getLineTypeClass(line)} ${
                          line.isHunk ? 'sticky top-0 z-10' : ''
                        }`}
                      >
                        {showLineNumbers && (
                          <div className="flex bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
                            <div className="w-12 px-2 py-1 text-right text-xs text-gray-500 dark:text-gray-400 select-none">
                              {line.oldLineNumber || ''}
                            </div>
                            <div className="w-12 px-2 py-1 text-right text-xs text-gray-500 dark:text-gray-400 select-none border-l border-gray-200 dark:border-gray-700">
                              {line.newLineNumber || ''}
                            </div>
                          </div>
                        )}
                        <div className={`flex-1 px-3 py-1 ${wordWrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}`}>
                          <span
                            className={
                              line.type === 'addition'
                                ? 'text-green-800 dark:text-green-300'
                                : line.type === 'deletion'
                                ? 'text-red-800 dark:text-red-300'
                                : line.type === 'header'
                                ? 'text-gray-700 dark:text-gray-300 font-semibold'
                                : 'text-gray-900 dark:text-gray-100'
                            }
                          >
                            {line.content}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Binary File Message */}
              {(!collapsible || expandedFiles.has(file.path)) && file.binary && (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800">
                  <FileText className="w-6 h-6 mx-auto mb-2" />
                  <p>Binary file - cannot display diff</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default GitDiffViewer;