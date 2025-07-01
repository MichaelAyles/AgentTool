import { promises as fs } from 'fs';
import { join, basename } from 'path';
import simpleGit from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/index.js';
import type { Project } from '@vibecode/shared';
import { structuredLogger } from '../middleware/logging.js';
import { AppError, ValidationError } from '../middleware/error-handler.js';

export interface CreateProjectOptions {
  name: string;
  path: string;
  activeAdapter: string;
  gitRemote?: string;
  description?: string;
  template?: string;
}

export interface CloneProjectOptions {
  repoUrl: string;
  localPath: string;
  branch?: string;
  activeAdapter: string;
  name?: string;
  depth?: number;
}

export interface InitProjectOptions {
  path: string;
  name: string;
  activeAdapter: string;
  gitInit?: boolean;
  template?: string;
  description?: string;
}

export class ProjectManager {
  async createProject(options: CreateProjectOptions, userId: string): Promise<Project> {
    const { name, path, activeAdapter, gitRemote, description } = options;

    // Validate inputs
    await this.validateProjectCreation(options);

    // Check if path already exists
    try {
      await fs.access(path);
      throw new ValidationError(`Directory ${path} already exists`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Create project directory
    await fs.mkdir(path, { recursive: true });

    // Create project record
    const project: Project = {
      id: uuidv4(),
      name,
      path,
      activeAdapter,
      gitRemote,
      settings: {
        defaultAdapter: activeAdapter,
        dangerousMode: false,
        autoCommit: false,
        description,
      },
      created: new Date(),
      lastAccessed: new Date(),
    };

    // Save to database
    db.createProject(project, userId);

    structuredLogger.info('Project created', {
      projectId: project.id,
      name,
      path,
      userId,
    });

    return project;
  }

  async cloneProject(options: CloneProjectOptions, userId: string): Promise<Project> {
    const { repoUrl, localPath, branch, activeAdapter, name, depth } = options;

    // Validate inputs
    await this.validateCloneOptions(options);

    // Ensure parent directory exists
    const parentDir = join(localPath, '..');
    await fs.mkdir(parentDir, { recursive: true });

    // Clone repository
    const git = simpleGit();
    const cloneOptions: any = {};
    
    if (branch) {
      cloneOptions['--branch'] = branch;
    }
    
    if (depth) {
      cloneOptions['--depth'] = depth.toString();
    }

    try {
      structuredLogger.info('Cloning repository', {
        repoUrl: this.sanitizeUrl(repoUrl),
        localPath,
        branch,
      });

      await git.clone(repoUrl, localPath, cloneOptions);
    } catch (error) {
      structuredLogger.error('Git clone failed', error, {
        repoUrl: this.sanitizeUrl(repoUrl),
        localPath,
      });
      throw new AppError(`Failed to clone repository: ${error.message}`, 400);
    }

    // Extract project name from repo URL if not provided
    const projectName = name || this.extractProjectNameFromUrl(repoUrl);

    // Get repository information
    const projectGit = simpleGit(localPath);
    const remotes = await projectGit.getRemotes(true);
    const origin = remotes.find(remote => remote.name === 'origin');

    // Create project record
    const project: Project = {
      id: uuidv4(),
      name: projectName,
      path: localPath,
      activeAdapter,
      gitRemote: origin?.refs?.fetch || repoUrl,
      settings: {
        defaultAdapter: activeAdapter,
        dangerousMode: false,
        autoCommit: false,
        clonedFrom: repoUrl,
        clonedBranch: branch,
      },
      created: new Date(),
      lastAccessed: new Date(),
    };

    // Save to database
    db.createProject(project, userId);

    structuredLogger.info('Project cloned successfully', {
      projectId: project.id,
      name: projectName,
      repoUrl: this.sanitizeUrl(repoUrl),
      localPath,
      userId,
    });

    return project;
  }

  async initializeProject(options: InitProjectOptions, userId: string): Promise<Project> {
    const { path, name, activeAdapter, gitInit = true, template, description } = options;

    // Validate inputs
    await this.validateInitOptions(options);

    // Create project directory if it doesn't exist
    await fs.mkdir(path, { recursive: true });

    // Initialize git repository if requested
    if (gitInit) {
      const git = simpleGit(path);
      await git.init();

      // Create initial README if directory is empty
      const files = await fs.readdir(path);
      if (files.length <= 1) { // Only .git directory
        await this.createInitialFiles(path, name, description);
        
        // Make initial commit
        await git.add('.');
        await git.commit('Initial commit');
      }
    }

    // Apply template if specified
    if (template) {
      await this.applyProjectTemplate(path, template);
    }

    // Create project record
    const project: Project = {
      id: uuidv4(),
      name,
      path,
      activeAdapter,
      settings: {
        defaultAdapter: activeAdapter,
        dangerousMode: false,
        autoCommit: false,
        template,
        description,
        initialized: true,
        gitInitialized: gitInit,
      },
      created: new Date(),
      lastAccessed: new Date(),
    };

    // Save to database
    db.createProject(project, userId);

    structuredLogger.info('Project initialized', {
      projectId: project.id,
      name,
      path,
      gitInit,
      template,
      userId,
    });

    return project;
  }

  async getProjectInfo(projectPath: string): Promise<{
    isGitRepo: boolean;
    gitStatus?: any;
    remotes?: any[];
    branches?: any;
    lastCommit?: any;
    stats?: {
      totalFiles: number;
      gitFiles: number;
      untracked: number;
      modified: number;
    };
  }> {
    try {
      const git = simpleGit(projectPath);
      
      // Check if it's a git repository
      const isGitRepo = await git.checkIsRepo();
      
      if (!isGitRepo) {
        const files = await fs.readdir(projectPath);
        return {
          isGitRepo: false,
          stats: {
            totalFiles: files.length,
            gitFiles: 0,
            untracked: files.length,
            modified: 0,
          },
        };
      }

      // Get git information
      const [status, remotes, branches, log] = await Promise.all([
        git.status(),
        git.getRemotes(true),
        git.branch(['-a']),
        git.log({ maxCount: 1 }),
      ]);

      return {
        isGitRepo: true,
        gitStatus: status,
        remotes,
        branches: {
          current: branches.current,
          all: branches.all,
        },
        lastCommit: log.latest,
        stats: {
          totalFiles: status.files.length,
          gitFiles: status.files.length - status.not_added.length,
          untracked: status.not_added.length,
          modified: status.modified.length + status.staged.length,
        },
      };
    } catch (error) {
      structuredLogger.error('Failed to get project info', error, { projectPath });
      throw new AppError(`Failed to analyze project: ${error.message}`, 500);
    }
  }

  async validateProjectPath(path: string): Promise<{
    exists: boolean;
    isEmpty: boolean;
    isGitRepo: boolean;
    hasConflicts: boolean;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    try {
      await fs.access(path);
      const files = await fs.readdir(path);
      const isEmpty = files.length === 0;

      // Check if it's a git repo
      const git = simpleGit(path);
      const isGitRepo = await git.checkIsRepo();

      // Check for common conflicts
      let hasConflicts = false;
      if (!isEmpty) {
        const conflictFiles = ['package.json', '.git', 'README.md', 'Dockerfile'];
        const foundConflicts = files.filter(file => conflictFiles.includes(file));
        
        if (foundConflicts.length > 0) {
          hasConflicts = true;
          warnings.push(`Directory contains existing files: ${foundConflicts.join(', ')}`);
        }
      }

      if (isGitRepo) {
        warnings.push('Directory is already a git repository');
      }

      return {
        exists: true,
        isEmpty,
        isGitRepo,
        hasConflicts,
        warnings,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          exists: false,
          isEmpty: true,
          isGitRepo: false,
          hasConflicts: false,
          warnings: [],
        };
      }
      throw error;
    }
  }

  private async validateProjectCreation(options: CreateProjectOptions): Promise<void> {
    const { name, path, activeAdapter } = options;

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Project name is required');
    }

    if (!path || path.trim().length === 0) {
      throw new ValidationError('Project path is required');
    }

    if (!activeAdapter || activeAdapter.trim().length === 0) {
      throw new ValidationError('Active adapter is required');
    }

    // Validate path format
    if (path.includes('..') || path.includes('~')) {
      throw new ValidationError('Invalid path format');
    }
  }

  private async validateCloneOptions(options: CloneProjectOptions): Promise<void> {
    const { repoUrl, localPath, activeAdapter } = options;

    if (!repoUrl || repoUrl.trim().length === 0) {
      throw new ValidationError('Repository URL is required');
    }

    if (!localPath || localPath.trim().length === 0) {
      throw new ValidationError('Local path is required');
    }

    if (!activeAdapter || activeAdapter.trim().length === 0) {
      throw new ValidationError('Active adapter is required');
    }

    // Basic URL validation
    try {
      new URL(repoUrl);
    } catch {
      // Check if it's a git SSH URL
      if (!repoUrl.match(/^git@[\w\.\-]+:[\w\.\-\/]+\.git$/)) {
        throw new ValidationError('Invalid repository URL format');
      }
    }
  }

  private async validateInitOptions(options: InitProjectOptions): Promise<void> {
    const { path, name, activeAdapter } = options;

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Project name is required');
    }

    if (!path || path.trim().length === 0) {
      throw new ValidationError('Project path is required');
    }

    if (!activeAdapter || activeAdapter.trim().length === 0) {
      throw new ValidationError('Active adapter is required');
    }
  }

  private extractProjectNameFromUrl(repoUrl: string): string {
    try {
      const url = new URL(repoUrl);
      const pathParts = url.pathname.split('/');
      const repoName = pathParts[pathParts.length - 1];
      return repoName.replace(/\.git$/, '');
    } catch {
      // Handle SSH URLs
      const match = repoUrl.match(/([^\/]+)\.git$/);
      return match ? match[1] : basename(repoUrl);
    }
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = '***';
      }
      return parsed.toString();
    } catch {
      // For SSH URLs, just remove any potential tokens/passwords
      return url.replace(/:([^@:]+)@/, ':***@');
    }
  }

  private async createInitialFiles(path: string, name: string, description?: string): Promise<void> {
    const readmeContent = `# ${name}

${description || 'A new project created with Vibe Code.'}

## Getting Started

This project was initialized with Vibe Code - a universal platform for managing AI coding assistants.

## Development

Use Vibe Code to interact with various AI coding tools and manage your development workflow.
`;

    await fs.writeFile(join(path, 'README.md'), readmeContent);
    
    // Create basic .gitignore
    const gitignoreContent = `node_modules/
.env
.env.local
.vscode/
.idea/
*.log
dist/
build/
.DS_Store
*.tmp
*.temp
`;

    await fs.writeFile(join(path, '.gitignore'), gitignoreContent);
  }

  private async applyProjectTemplate(path: string, template: string): Promise<void> {
    // This is a placeholder for template application
    // In a full implementation, this would copy files from template directories
    structuredLogger.info('Applying project template', { path, template });
    
    switch (template) {
      case 'node':
        await this.applyNodeTemplate(path);
        break;
      case 'python':
        await this.applyPythonTemplate(path);
        break;
      case 'web':
        await this.applyWebTemplate(path);
        break;
      default:
        structuredLogger.warn('Unknown template', { template });
    }
  }

  private async applyNodeTemplate(path: string): Promise<void> {
    const packageJson = {
      name: basename(path),
      version: '1.0.0',
      description: '',
      main: 'index.js',
      scripts: {
        start: 'node index.js',
        dev: 'node --watch index.js',
        test: 'echo "Error: no test specified" && exit 1',
      },
      keywords: [],
      author: '',
      license: 'ISC',
    };

    await fs.writeFile(
      join(path, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    const indexJs = `console.log('Hello from ${basename(path)}!');
`;

    await fs.writeFile(join(path, 'index.js'), indexJs);
  }

  private async applyPythonTemplate(path: string): Promise<void> {
    const mainPy = `#!/usr/bin/env python3
"""
${basename(path)} - A Python project created with Vibe Code
"""

def main():
    print(f"Hello from ${basename(path)}!")

if __name__ == "__main__":
    main()
`;

    await fs.writeFile(join(path, 'main.py'), mainPy);

    const requirementsTxt = `# Add your dependencies here
`;

    await fs.writeFile(join(path, 'requirements.txt'), requirementsTxt);
  }

  private async applyWebTemplate(path: string): Promise<void> {
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${basename(path)}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 2rem; }
        .container { max-width: 800px; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Welcome to ${basename(path)}</h1>
        <p>This project was created with Vibe Code.</p>
    </div>
</body>
</html>
`;

    await fs.writeFile(join(path, 'index.html'), indexHtml);
  }
}

export const projectManager = new ProjectManager();