import { SimpleGit } from 'simple-git';
import { structuredLogger } from '../middleware/logging.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

// Git operation results
export interface GitOperationResult {
  success: boolean;
  operation: string;
  message?: string;
  error?: string;
  data?: any;
  duration: number;
  timestamp: Date;
}

// Commit operation data
export interface CommitData {
  message: string;
  author?: {
    name: string;
    email: string;
  };
  files?: string[];
  allStaged?: boolean;
  amend?: boolean;
  allowEmpty?: boolean;
}

// Push operation data
export interface PushData {
  remote?: string;
  branch?: string;
  force?: boolean;
  setUpstream?: boolean;
  tags?: boolean;
}

// Pull operation data
export interface PullData {
  remote?: string;
  branch?: string;
  rebase?: boolean;
  strategy?: string;
}

// Stage operation data
export interface StageData {
  files: string[];
  all?: boolean;
  update?: boolean;
}

// Unstage operation data
export interface UnstageData {
  files: string[];
  all?: boolean;
}

// Reset operation data
export interface ResetData {
  mode: 'soft' | 'mixed' | 'hard';
  commit?: string;
  files?: string[];
}

// Branch operation data
export interface BranchData {
  name: string;
  startPoint?: string;
  force?: boolean;
  track?: boolean;
  upstream?: string;
}

// Merge operation data
export interface MergeData {
  branch: string;
  strategy?: string;
  noFf?: boolean;
  squash?: boolean;
  message?: string;
}

export class GitOperations {
  private git: SimpleGit;
  private projectPath: string;
  private userId: string;

  constructor(git: SimpleGit, projectPath: string, userId: string) {
    this.git = git;
    this.projectPath = projectPath;
    this.userId = userId;
  }

  /**
   * Stage files for commit
   */
  async stageFiles(data: StageData): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      let result;

      if (data.all) {
        result = await this.git.add('.');
      } else if (data.update) {
        result = await this.git.add(['-u', ...data.files]);
      } else {
        result = await this.git.add(data.files);
      }

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'stage',
        message: `Successfully staged ${data.all ? 'all files' : data.files.length + ' files'}`,
        data: {
          files: data.files,
          all: data.all,
          update: data.update,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'stage',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    }
  }

  /**
   * Unstage files
   */
  async unstageFiles(data: UnstageData): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      let result;

      if (data.all) {
        result = await this.git.reset(['HEAD']);
      } else {
        result = await this.git.reset(['HEAD', ...data.files]);
      }

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'unstage',
        message: `Successfully unstaged ${data.all ? 'all files' : data.files.length + ' files'}`,
        data: {
          files: data.files,
          all: data.all,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'unstage',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    }
  }

  /**
   * Commit staged changes
   */
  async commit(data: CommitData): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      // Validate commit message
      if (!data.message || data.message.trim().length === 0) {
        throw new Error('Commit message is required');
      }

      // Set author if provided
      if (data.author) {
        await this.git.addConfig('user.name', data.author.name, false, 'local');
        await this.git.addConfig(
          'user.email',
          data.author.email,
          false,
          'local'
        );
      }

      let commitOptions: string[] = ['-m', data.message];

      if (data.amend) {
        commitOptions.push('--amend');
      }

      if (data.allowEmpty) {
        commitOptions.push('--allow-empty');
      }

      // Stage specific files if provided
      if (data.files && data.files.length > 0 && !data.allStaged) {
        await this.git.add(data.files);
      }

      const result = await this.git.commit(
        data.message,
        commitOptions.slice(2)
      ); // Remove -m and message

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'commit',
        message: `Successfully created commit: ${result.commit}`,
        data: {
          commit: result.commit,
          summary: result.summary,
          message: data.message,
          author: data.author,
          insertions: result.summary?.insertions || 0,
          deletions: result.summary?.deletions || 0,
          filesChanged: result.summary?.changes || 0,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'commit',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    }
  }

  /**
   * Push changes to remote
   */
  async push(data: PushData = {}): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      const remote = data.remote || 'origin';
      const branch = data.branch || (await this.getCurrentBranch());

      let pushOptions: string[] = [];

      if (data.setUpstream) {
        pushOptions.push('--set-upstream');
      }

      if (data.force) {
        pushOptions.push('--force');
      }

      if (data.tags) {
        pushOptions.push('--tags');
      }

      const result = await this.git.push(remote, branch, pushOptions);

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'push',
        message: `Successfully pushed to ${remote}/${branch}`,
        data: {
          remote,
          branch,
          pushed: result.pushed,
          total: result.total,
          repo: result.repo,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.DANGEROUS);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'push',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.DANGEROUS);
      return operationResult;
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(data: PullData = {}): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      const remote = data.remote || 'origin';
      const branch = data.branch || (await this.getCurrentBranch());

      let pullOptions: string[] = [];

      if (data.rebase) {
        pullOptions.push('--rebase');
      }

      if (data.strategy) {
        pullOptions.push('--strategy', data.strategy);
      }

      const result = await this.git.pull(remote, branch, pullOptions);

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'pull',
        message: `Successfully pulled from ${remote}/${branch}`,
        data: {
          remote,
          branch,
          summary: result.summary,
          files: result.files,
          insertions: result.insertions,
          deletions: result.deletions,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'pull',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(data: BranchData): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      let options: string[] = [];

      if (data.force) {
        options.push('-f');
      }

      if (data.track && data.upstream) {
        options.push('--track', data.upstream);
      }

      if (data.startPoint) {
        await this.git.checkoutBranch(data.name, data.startPoint);
      } else {
        await this.git.checkoutLocalBranch(data.name);
      }

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'create_branch',
        message: `Successfully created branch: ${data.name}`,
        data: {
          name: data.name,
          startPoint: data.startPoint,
          track: data.track,
          upstream: data.upstream,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'create_branch',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    }
  }

  /**
   * Switch to a branch
   */
  async checkoutBranch(branchName: string): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      const result = await this.git.checkout(branchName);

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'checkout',
        message: `Successfully switched to branch: ${branchName}`,
        data: {
          branch: branchName,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'checkout',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    }
  }

  /**
   * Merge a branch
   */
  async merge(data: MergeData): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      let options: string[] = [];

      if (data.noFf) {
        options.push('--no-ff');
      }

      if (data.squash) {
        options.push('--squash');
      }

      if (data.strategy) {
        options.push('--strategy', data.strategy);
      }

      if (data.message) {
        options.push('-m', data.message);
      }

      const result = await this.git.merge([data.branch, ...options]);

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'merge',
        message: `Successfully merged branch: ${data.branch}`,
        data: {
          branch: data.branch,
          strategy: data.strategy,
          noFf: data.noFf,
          squash: data.squash,
          message: data.message,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'merge',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.MODERATE);
      return operationResult;
    }
  }

  /**
   * Reset repository state
   */
  async reset(data: ResetData): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      let options: string[] = [`--${data.mode}`];

      if (data.commit) {
        options.push(data.commit);
      }

      if (data.files && data.files.length > 0) {
        options.push('--', ...data.files);
      }

      const result = await this.git.reset(options);

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'reset',
        message: `Successfully reset repository (${data.mode})`,
        data: {
          mode: data.mode,
          commit: data.commit,
          files: data.files,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.DANGEROUS);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'reset',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.DANGEROUS);
      return operationResult;
    }
  }

  /**
   * Create and apply a stash
   */
  async stash(
    message?: string,
    includeUntracked: boolean = false
  ): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      let options: string[] = [];

      if (message) {
        options.push('-m', message);
      }

      if (includeUntracked) {
        options.push('-u');
      }

      const result = await this.git.stash(options);

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'stash',
        message: 'Successfully created stash',
        data: {
          message,
          includeUntracked,
        },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'stash',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    }
  }

  /**
   * Apply a stash
   */
  async stashPop(index: number = 0): Promise<GitOperationResult> {
    const startTime = Date.now();

    try {
      const result = await this.git.stash(['pop', `stash@{${index}}`]);

      const operationResult: GitOperationResult = {
        success: true,
        operation: 'stash_pop',
        message: `Successfully applied stash@{${index}}`,
        data: { index },
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    } catch (error) {
      const operationResult: GitOperationResult = {
        success: false,
        operation: 'stash_pop',
        error: (error as Error).message,
        duration: Date.now() - startTime,
        timestamp: new Date(),
      };

      await this.logOperation(operationResult, SecurityLevel.SAFE);
      return operationResult;
    }
  }

  // Private helper methods

  private async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'HEAD';
  }

  private async logOperation(
    result: GitOperationResult,
    severity: SecurityLevel
  ): Promise<void> {
    const category =
      severity === SecurityLevel.DANGEROUS
        ? AuditCategory.DANGEROUS_OPERATIONS
        : AuditCategory.SYSTEM_CHANGES;

    await comprehensiveAuditLogger.logAuditEvent({
      category,
      action: `git_${result.operation}`,
      resourceType: 'git_repository',
      resourceId: this.projectPath,
      userId: this.userId,
      outcome: result.success ? 'success' : 'failure',
      severity,
      details: {
        operation: result.operation,
        projectPath: this.projectPath,
        duration: result.duration,
        data: result.data,
        error: result.error,
      },
    });

    if (result.success) {
      structuredLogger.info(`Git operation completed: ${result.operation}`, {
        userId: this.userId,
        projectPath: this.projectPath,
        operation: result.operation,
        duration: result.duration,
      });
    } else {
      structuredLogger.error(
        `Git operation failed: ${result.operation}`,
        new Error(result.error || 'Unknown error'),
        {
          userId: this.userId,
          projectPath: this.projectPath,
          operation: result.operation,
          duration: result.duration,
        }
      );
    }
  }
}
