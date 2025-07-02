import {
  SimpleGit,
  StatusResult,
  FileStatusResult,
  DiffResult,
} from 'simple-git';
import { promises as fs } from 'fs';
import { join, relative, dirname } from 'path';
import { structuredLogger } from '../middleware/logging.js';

// Enhanced git status with visualization data
export interface GitStatusVisualization {
  repository: {
    path: string;
    name: string;
    isGitRepo: boolean;
    gitDir: string;
  };
  branch: {
    current: string;
    upstream?: string;
    ahead: number;
    behind: number;
    tracking: string | null;
    remotes: string[];
  };
  workingTree: {
    isClean: boolean;
    totalChanges: number;
    summary: {
      staged: number;
      unstaged: number;
      untracked: number;
      deleted: number;
      renamed: number;
      conflicted: number;
    };
  };
  changes: GitFileChange[];
  stashes: GitStashInfo[];
  lastCommit?: GitCommitInfo;
  remoteStatus: GitRemoteStatus;
}

// Detailed file change information
export interface GitFileChange {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  unstaged: boolean;
  originalPath?: string; // For renames
  conflicted: boolean;
  diffStats?: {
    insertions: number;
    deletions: number;
    binary: boolean;
  };
  directory: string;
  filename: string;
  extension: string;
  size?: number;
  lastModified?: Date;
}

// Git file status types
export enum GitFileStatus {
  ADDED = 'added',
  MODIFIED = 'modified',
  DELETED = 'deleted',
  RENAMED = 'renamed',
  COPIED = 'copied',
  UNTRACKED = 'untracked',
  IGNORED = 'ignored',
  CONFLICTED = 'conflicted',
  UNKNOWN = 'unknown',
}

// Stash information
export interface GitStashInfo {
  index: number;
  message: string;
  branch: string;
  author: string;
  date: Date;
  hash: string;
}

// Commit information
export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
  refs: string[];
  filesChanged: number;
  insertions: number;
  deletions: number;
}

// Remote status
export interface GitRemoteStatus {
  hasRemote: boolean;
  remotes: Array<{
    name: string;
    url: string;
    type: 'fetch' | 'push';
  }>;
  upToDate: boolean;
  needsPush: boolean;
  needsPull: boolean;
  diverged: boolean;
}

// Tree structure for directory visualization
export interface GitTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  changes?: GitFileChange[];
  children?: GitTreeNode[];
  summary?: {
    totalChanges: number;
    staged: number;
    unstaged: number;
    untracked: number;
  };
}

export class GitStatusVisualizer {
  private git: SimpleGit;
  private projectPath: string;

  constructor(git: SimpleGit, projectPath: string) {
    this.git = git;
    this.projectPath = projectPath;
  }

  /**
   * Generate comprehensive git status visualization
   */
  async generateVisualization(): Promise<GitStatusVisualization> {
    try {
      // Check if this is a git repository
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error('Not a git repository');
      }

      // Get all git information in parallel for performance
      const [status, branches, remotes, stashes, lastCommit, gitDir] =
        await Promise.all([
          this.git.status(),
          this.git.branch(['-a']),
          this.git.getRemotes(true),
          this.getStashes(),
          this.getLastCommit(),
          this.git.revparse(['--git-dir']),
        ]);

      // Build comprehensive status
      const visualization: GitStatusVisualization = {
        repository: {
          path: this.projectPath,
          name: this.getRepositoryName(),
          isGitRepo: true,
          gitDir: join(this.projectPath, gitDir),
        },
        branch: {
          current: status.current || 'HEAD',
          upstream: status.tracking || undefined,
          ahead: status.ahead,
          behind: status.behind,
          tracking: status.tracking,
          remotes: remotes.map(r => r.name),
        },
        workingTree: {
          isClean: status.isClean(),
          totalChanges: this.getTotalChanges(status),
          summary: {
            staged: status.staged.length,
            unstaged: status.modified.length + status.deleted.length,
            untracked: status.not_added.length,
            deleted: status.deleted.length,
            renamed: status.renamed.length,
            conflicted: status.conflicted.length,
          },
        },
        changes: await this.buildFileChanges(status),
        stashes,
        lastCommit,
        remoteStatus: {
          hasRemote: remotes.length > 0,
          remotes: remotes.flatMap(r => [
            { name: r.name, url: r.refs.fetch, type: 'fetch' as const },
            { name: r.name, url: r.refs.push, type: 'push' as const },
          ]),
          upToDate: status.ahead === 0 && status.behind === 0,
          needsPush: status.ahead > 0,
          needsPull: status.behind > 0,
          diverged: status.ahead > 0 && status.behind > 0,
        },
      };

      return visualization;
    } catch (error) {
      structuredLogger.error(
        'Failed to generate git status visualization',
        error as Error,
        {
          projectPath: this.projectPath,
        }
      );
      throw error;
    }
  }

  /**
   * Build tree structure of changes
   */
  async buildChangeTree(): Promise<GitTreeNode> {
    const status = await this.git.status();
    const changes = await this.buildFileChanges(status);

    const root: GitTreeNode = {
      name: this.getRepositoryName(),
      path: '',
      type: 'directory',
      children: [],
      summary: {
        totalChanges: changes.length,
        staged: changes.filter(c => c.staged).length,
        unstaged: changes.filter(c => c.unstaged).length,
        untracked: changes.filter(c => c.status === GitFileStatus.UNTRACKED)
          .length,
      },
    };

    // Build tree structure
    for (const change of changes) {
      this.insertIntoTree(root, change);
    }

    // Calculate directory summaries
    this.calculateDirectorySummaries(root);

    return root;
  }

  /**
   * Get detailed diff information for a file
   */
  async getFileDiff(
    filePath: string,
    staged: boolean = false
  ): Promise<{
    diff: string;
    stats: {
      insertions: number;
      deletions: number;
      binary: boolean;
    };
  }> {
    try {
      const diffArgs = staged ? ['--cached', filePath] : [filePath];
      const diff = await this.git.diff(diffArgs);

      // Parse diff stats
      const diffStat = await this.git.diffSummary(diffArgs);
      const fileStat = diffStat.files.find(f => f.file === filePath);

      return {
        diff,
        stats: {
          insertions: fileStat?.insertions || 0,
          deletions: fileStat?.deletions || 0,
          binary: fileStat?.binary || false,
        },
      };
    } catch (error) {
      structuredLogger.error('Failed to get file diff', error as Error, {
        filePath,
      });
      throw error;
    }
  }

  /**
   * Get commit history with file changes
   */
  async getCommitHistory(
    options: {
      maxCount?: number;
      since?: string;
      until?: string;
      author?: string;
      path?: string;
    } = {}
  ): Promise<GitCommitInfo[]> {
    try {
      const logOptions: any = {
        maxCount: options.maxCount || 20,
        format: {
          hash: '%H',
          shortHash: '%h',
          message: '%s',
          author: '%an',
          authorEmail: '%ae',
          date: '%ai',
          refs: '%D',
        },
      };

      if (options.since) logOptions.from = options.since;
      if (options.until) logOptions.to = options.until;
      if (options.author) logOptions.author = options.author;

      const log = await this.git.log(logOptions);

      // Get detailed stats for each commit
      const commits: GitCommitInfo[] = [];
      for (const commit of log.all) {
        try {
          const diffStat = await this.git.diffSummary([
            `${commit.hash}~1`,
            commit.hash,
          ]);

          commits.push({
            hash: commit.hash,
            shortHash: commit.hash.substring(0, 7),
            message: commit.message,
            author: commit.author_name,
            authorEmail: commit.author_email,
            date: new Date(commit.date),
            refs: commit.refs ? commit.refs.split(', ').filter(Boolean) : [],
            filesChanged: diffStat.files.length,
            insertions: diffStat.insertions,
            deletions: diffStat.deletions,
          });
        } catch (error) {
          // For first commit or other edge cases, use basic info
          commits.push({
            hash: commit.hash,
            shortHash: commit.hash.substring(0, 7),
            message: commit.message,
            author: commit.author_name,
            authorEmail: commit.author_email,
            date: new Date(commit.date),
            refs: commit.refs ? commit.refs.split(', ').filter(Boolean) : [],
            filesChanged: 0,
            insertions: 0,
            deletions: 0,
          });
        }
      }

      return commits;
    } catch (error) {
      structuredLogger.error('Failed to get commit history', error as Error);
      throw error;
    }
  }

  // Private methods

  private getRepositoryName(): string {
    return this.projectPath.split('/').pop() || 'repository';
  }

  private getTotalChanges(status: StatusResult): number {
    return (
      status.staged.length +
      status.modified.length +
      status.not_added.length +
      status.deleted.length +
      status.renamed.length +
      status.conflicted.length
    );
  }

  private async buildFileChanges(
    status: StatusResult
  ): Promise<GitFileChange[]> {
    const changes: GitFileChange[] = [];

    // Process all file states
    const allFiles = new Set([
      ...status.staged,
      ...status.modified,
      ...status.not_added,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
      ...status.conflicted,
    ]);

    for (const filePath of allFiles) {
      try {
        const change = await this.buildFileChange(filePath, status);
        changes.push(change);
      } catch (error) {
        structuredLogger.warn('Failed to build file change info', {
          filePath,
          error: (error as Error).message,
        });
      }
    }

    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async buildFileChange(
    filePath: string,
    status: StatusResult
  ): Promise<GitFileChange> {
    const fullPath = join(this.projectPath, filePath);
    const directory = dirname(filePath);
    const filename = filePath.split('/').pop() || '';
    const extension = filename.includes('.')
      ? filename.split('.').pop() || ''
      : '';

    // Determine file status
    let fileStatus = GitFileStatus.UNKNOWN;
    let staged = false;
    let unstaged = false;
    let originalPath: string | undefined;

    if (status.staged.includes(filePath)) {
      staged = true;
      if (status.created.includes(filePath)) {
        fileStatus = GitFileStatus.ADDED;
      } else if (status.deleted.includes(filePath)) {
        fileStatus = GitFileStatus.DELETED;
      } else {
        fileStatus = GitFileStatus.MODIFIED;
      }
    }

    if (status.modified.includes(filePath)) {
      unstaged = true;
      fileStatus = GitFileStatus.MODIFIED;
    }

    if (status.not_added.includes(filePath)) {
      unstaged = true;
      fileStatus = GitFileStatus.UNTRACKED;
    }

    if (status.deleted.includes(filePath)) {
      if (!staged) unstaged = true;
      fileStatus = GitFileStatus.DELETED;
    }

    if (status.conflicted.includes(filePath)) {
      fileStatus = GitFileStatus.CONFLICTED;
    }

    // Check for renames
    const renameInfo = status.renamed.find(r => r.to === filePath);
    if (renameInfo) {
      fileStatus = GitFileStatus.RENAMED;
      originalPath = renameInfo.from;
      staged = true; // Renames are always staged
    }

    // Get file stats if file exists
    let size: number | undefined;
    let lastModified: Date | undefined;

    try {
      if (fileStatus !== GitFileStatus.DELETED) {
        const stats = await fs.stat(fullPath);
        size = stats.size;
        lastModified = stats.mtime;
      }
    } catch (error) {
      // File might not exist (deleted, etc.)
    }

    // Get diff stats for performance (only for changed files)
    let diffStats: GitFileChange['diffStats'];
    if (fileStatus !== GitFileStatus.UNTRACKED) {
      try {
        const diffSummary = await this.git.diffSummary([filePath]);
        const fileDiff = diffSummary.files.find(f => f.file === filePath);
        if (fileDiff) {
          diffStats = {
            insertions: fileDiff.insertions,
            deletions: fileDiff.deletions,
            binary: fileDiff.binary,
          };
        }
      } catch (error) {
        // Diff might fail for some files, that's okay
      }
    }

    return {
      path: filePath,
      status: fileStatus,
      staged,
      unstaged,
      originalPath,
      conflicted: status.conflicted.includes(filePath),
      diffStats,
      directory,
      filename,
      extension,
      size,
      lastModified,
    };
  }

  private async getStashes(): Promise<GitStashInfo[]> {
    try {
      const stashList = await this.git.stashList();
      return stashList.all.map((stash, index) => ({
        index,
        message: stash.message,
        branch: stash.refs || '',
        author: stash.author_name,
        date: new Date(stash.date),
        hash: stash.hash,
      }));
    } catch (error) {
      // Stash list might fail, return empty array
      return [];
    }
  }

  private async getLastCommit(): Promise<GitCommitInfo | undefined> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log.latest) {
        const commit = log.latest;

        // Get diff stats for the commit
        let filesChanged = 0;
        let insertions = 0;
        let deletions = 0;

        try {
          const diffStat = await this.git.diffSummary([
            `${commit.hash}~1`,
            commit.hash,
          ]);
          filesChanged = diffStat.files.length;
          insertions = diffStat.insertions;
          deletions = diffStat.deletions;
        } catch (error) {
          // Might be the first commit
        }

        return {
          hash: commit.hash,
          shortHash: commit.hash.substring(0, 7),
          message: commit.message,
          author: commit.author_name,
          authorEmail: commit.author_email,
          date: new Date(commit.date),
          refs: commit.refs ? commit.refs.split(', ').filter(Boolean) : [],
          filesChanged,
          insertions,
          deletions,
        };
      }
    } catch (error) {
      // No commits yet
    }
    return undefined;
  }

  private insertIntoTree(root: GitTreeNode, change: GitFileChange): void {
    const pathParts = change.path.split('/');
    let current = root;

    // Navigate to the parent directory
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      let child = current.children?.find(c => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: pathParts.slice(0, i + 1).join('/'),
          type: 'directory',
          children: [],
        };

        if (!current.children) current.children = [];
        current.children.push(child);
      }

      current = child;
    }

    // Add the file
    const fileName = pathParts[pathParts.length - 1];
    if (!current.children) current.children = [];

    current.children.push({
      name: fileName,
      path: change.path,
      type: 'file',
      changes: [change],
    });
  }

  private calculateDirectorySummaries(node: GitTreeNode): void {
    if (node.type === 'directory' && node.children) {
      let totalChanges = 0;
      let staged = 0;
      let unstaged = 0;
      let untracked = 0;

      for (const child of node.children) {
        if (child.type === 'file' && child.changes) {
          totalChanges += child.changes.length;
          staged += child.changes.filter(c => c.staged).length;
          unstaged += child.changes.filter(c => c.unstaged).length;
          untracked += child.changes.filter(
            c => c.status === GitFileStatus.UNTRACKED
          ).length;
        } else if (child.type === 'directory') {
          this.calculateDirectorySummaries(child);
          if (child.summary) {
            totalChanges += child.summary.totalChanges;
            staged += child.summary.staged;
            unstaged += child.summary.unstaged;
            untracked += child.summary.untracked;
          }
        }
      }

      node.summary = { totalChanges, staged, unstaged, untracked };
    }
  }
}
