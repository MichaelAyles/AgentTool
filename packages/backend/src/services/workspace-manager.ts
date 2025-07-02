import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';

export interface WorkspaceConfig {
  tempDir: string;
  gitEnabled: boolean;
  preserveGitHistory: boolean;
  excludePatterns: string[];
  maxWorkspaceSize: number; // in MB
  cleanupAfter: number; // in milliseconds
}

export interface FileChange {
  path: string;
  content: string;
  operation: 'create' | 'update' | 'delete';
  mode?: string; // file permissions
}

export interface WorkspaceInfo {
  id: string;
  path: string;
  sourceProject: string;
  createdAt: Date;
  size: number; // in bytes
  fileCount: number;
  changes: FileChange[];
}

export class WorkspaceManager {
  private config: WorkspaceConfig;
  private activeWorkspaces = new Map<string, WorkspaceInfo>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<WorkspaceConfig> = {}) {
    this.config = {
      tempDir: '/tmp/vibe-code-workspaces',
      gitEnabled: true,
      preserveGitHistory: false,
      excludePatterns: [
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        'coverage',
        '.cache',
        '.tmp',
        '*.log',
        '.DS_Store',
        'Thumbs.db',
      ],
      maxWorkspaceSize: 1024, // 1GB
      cleanupAfter: 3600000, // 1 hour
      ...config,
    };

    this.startCleanupTimer();
  }

  /**
   * Create a new temporary workspace with AI-generated changes applied
   */
  async createWorkspace(
    sourceProjectPath: string,
    changes: FileChange[] = [],
    options: {
      preserveNodeModules?: boolean;
      preserveGit?: boolean;
      workspaceId?: string;
    } = {}
  ): Promise<WorkspaceInfo> {
    const workspaceId = options.workspaceId || uuidv4();
    const workspacePath = path.join(this.config.tempDir, workspaceId);

    // Ensure temp directory exists
    await fs.mkdir(this.config.tempDir, { recursive: true });

    // Create workspace directory
    await fs.mkdir(workspacePath, { recursive: true });

    try {
      // Copy source project files
      await this.copyProject(sourceProjectPath, workspacePath, {
        preserveNodeModules: options.preserveNodeModules,
        preserveGit: options.preserveGit || this.config.preserveGitHistory,
      });

      // Apply file changes
      await this.applyChanges(workspacePath, changes);

      // Initialize git if enabled and not preserved
      if (this.config.gitEnabled && !options.preserveGit) {
        await this.initializeGit(workspacePath);
      }

      // Calculate workspace info
      const { size, fileCount } =
        await this.calculateWorkspaceStats(workspacePath);

      const workspaceInfo: WorkspaceInfo = {
        id: workspaceId,
        path: workspacePath,
        sourceProject: sourceProjectPath,
        createdAt: new Date(),
        size,
        fileCount,
        changes,
      };

      this.activeWorkspaces.set(workspaceId, workspaceInfo);

      return workspaceInfo;
    } catch (error) {
      // Cleanup on failure
      await this.cleanupWorkspace(workspaceId, true);
      throw new Error(`Failed to create workspace: ${error}`);
    }
  }

  /**
   * Apply additional changes to an existing workspace
   */
  async applyAdditionalChanges(
    workspaceId: string,
    changes: FileChange[]
  ): Promise<void> {
    const workspace = this.activeWorkspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    await this.applyChanges(workspace.path, changes);

    // Update workspace info
    workspace.changes.push(...changes);
    const { size, fileCount } = await this.calculateWorkspaceStats(
      workspace.path
    );
    workspace.size = size;
    workspace.fileCount = fileCount;
  }

  /**
   * Get workspace information
   */
  getWorkspaceInfo(workspaceId: string): WorkspaceInfo | null {
    return this.activeWorkspaces.get(workspaceId) || null;
  }

  /**
   * List all active workspaces
   */
  listWorkspaces(): WorkspaceInfo[] {
    return Array.from(this.activeWorkspaces.values());
  }

  /**
   * Execute a command in a workspace
   */
  async executeInWorkspace(
    workspaceId: string,
    command: string,
    options: {
      timeout?: number;
      env?: Record<string, string>;
      shell?: boolean;
    } = {}
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
  }> {
    const workspace = this.activeWorkspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd: workspace.path,
        stdio: 'pipe',
        shell: options.shell !== false,
        env: { ...process.env, ...options.env },
      });

      child.stdout?.on('data', data => {
        stdout += data.toString();
      });

      child.stderr?.on('data', data => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(
          new Error(`Command timed out after ${options.timeout || 30000}ms`)
        );
      }, options.timeout || 30000);

      child.on('close', exitCode => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;

        resolve({
          exitCode: exitCode || 0,
          stdout,
          stderr,
          duration,
        });
      });

      child.on('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Create a snapshot of the workspace state
   */
  async createSnapshot(workspaceId: string, name?: string): Promise<string> {
    const workspace = this.activeWorkspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    const snapshotName = name || `snapshot-${Date.now()}`;
    const snapshotPath = path.join(
      this.config.tempDir,
      `${workspaceId}-${snapshotName}`
    );

    await this.copyDirectory(workspace.path, snapshotPath);

    return snapshotPath;
  }

  /**
   * Cleanup a specific workspace
   */
  async cleanupWorkspace(
    workspaceId: string,
    force: boolean = false
  ): Promise<boolean> {
    const workspace = this.activeWorkspaces.get(workspaceId);
    if (!workspace) {
      return false;
    }

    try {
      await fs.rm(workspace.path, { recursive: true, force: true });
      this.activeWorkspaces.delete(workspaceId);
      return true;
    } catch (error) {
      if (!force) {
        console.warn(`Failed to cleanup workspace ${workspaceId}:`, error);
      }
      return false;
    }
  }

  /**
   * Cleanup all expired workspaces
   */
  async cleanupExpiredWorkspaces(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [workspaceId, workspace] of this.activeWorkspaces.entries()) {
      const age = now - workspace.createdAt.getTime();
      if (age > this.config.cleanupAfter) {
        const cleaned = await this.cleanupWorkspace(workspaceId, true);
        if (cleaned) {
          cleanedCount++;
        }
      }
    }

    return cleanedCount;
  }

  /**
   * Copy project files to workspace
   */
  private async copyProject(
    source: string,
    destination: string,
    options: {
      preserveNodeModules?: boolean;
      preserveGit?: boolean;
    }
  ): Promise<void> {
    const excludePatterns = [...this.config.excludePatterns];

    if (!options.preserveNodeModules) {
      excludePatterns.push('node_modules');
    }

    if (!options.preserveGit) {
      excludePatterns.push('.git');
    }

    await this.copyDirectory(source, destination, excludePatterns);
  }

  /**
   * Apply file changes to workspace
   */
  private async applyChanges(
    workspacePath: string,
    changes: FileChange[]
  ): Promise<void> {
    for (const change of changes) {
      const targetPath = path.join(workspacePath, change.path);

      switch (change.operation) {
        case 'create':
        case 'update':
          await fs.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.writeFile(targetPath, change.content, 'utf8');

          if (change.mode) {
            await fs.chmod(targetPath, change.mode);
          }
          break;

        case 'delete':
          try {
            const stat = await fs.stat(targetPath);
            if (stat.isDirectory()) {
              await fs.rm(targetPath, { recursive: true });
            } else {
              await fs.unlink(targetPath);
            }
          } catch (error) {
            // File/directory might not exist, continue
          }
          break;
      }
    }
  }

  /**
   * Initialize git repository in workspace
   */
  private async initializeGit(workspacePath: string): Promise<void> {
    try {
      await this.executeCommand('git init', { cwd: workspacePath });
      await this.executeCommand('git add .', { cwd: workspacePath });
      await this.executeCommand(
        'git commit -m "Initial commit from validation workspace"',
        { cwd: workspacePath }
      );
    } catch (error) {
      console.warn('Failed to initialize git in workspace:', error);
    }
  }

  /**
   * Copy directory with exclusions
   */
  private async copyDirectory(
    src: string,
    dest: string,
    excludePatterns: string[] = []
  ): Promise<void> {
    const stat = await fs.stat(src);

    if (stat.isDirectory()) {
      await fs.mkdir(dest, { recursive: true });
      const files = await fs.readdir(src);

      for (const file of files) {
        // Check if file should be excluded
        const shouldExclude = excludePatterns.some(pattern => {
          if (pattern.includes('*')) {
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            return regex.test(file);
          }
          return file === pattern;
        });

        if (shouldExclude) {
          continue;
        }

        await this.copyDirectory(
          path.join(src, file),
          path.join(dest, file),
          excludePatterns
        );
      }
    } else {
      await fs.copyFile(src, dest);
    }
  }

  /**
   * Calculate workspace statistics
   */
  private async calculateWorkspaceStats(workspacePath: string): Promise<{
    size: number;
    fileCount: number;
  }> {
    let size = 0;
    let fileCount = 0;

    const calculateRecursive = async (dirPath: string): Promise<void> => {
      const files = await fs.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isDirectory()) {
          await calculateRecursive(filePath);
        } else {
          size += stat.size;
          fileCount++;
        }
      }
    };

    await calculateRecursive(workspacePath);

    return { size, fileCount };
  }

  /**
   * Execute command helper
   */
  private async executeCommand(
    command: string,
    options: { cwd: string }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd: options.cwd,
        stdio: 'pipe',
        shell: true,
      });

      child.on('close', exitCode => {
        if (exitCode === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${exitCode}`));
        }
      });

      child.on('error', reject);
    });
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Run cleanup every 30 minutes
    this.cleanupTimer = setInterval(
      async () => {
        try {
          const cleaned = await this.cleanupExpiredWorkspaces();
          if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} expired workspaces`);
          }
        } catch (error) {
          console.warn('Error during workspace cleanup:', error);
        }
      },
      30 * 60 * 1000
    );
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Cleanup all active workspaces
    const workspaceIds = Array.from(this.activeWorkspaces.keys());
    await Promise.all(workspaceIds.map(id => this.cleanupWorkspace(id, true)));
  }
}

// Export singleton instance
export const workspaceManager = new WorkspaceManager();
