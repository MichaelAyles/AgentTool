import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface Project {
  id: string;
  name: string;
  description?: string;
  path: string;
  color: string;
  createdAt: Date;
  lastAccessedAt: Date;
  settings: ProjectSettings;
  type: 'local' | 'git' | 'new-git' | 'clone-git' | 'open-git';
  gitRepo?: GitRepository;
}

export interface ProjectSettings {
  defaultShell?: string;
  workingDirectory?: string;
  environmentVariables?: Record<string, string>;
  terminalSettings?: {
    cols: number;
    rows: number;
    fontSize: number;
  };
}

export interface GitRepository {
  url: string;
  branch: string;
  status: 'clean' | 'dirty' | 'ahead' | 'behind';
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: Date;
  };
}

export class ProjectManager extends EventEmitter {
  private projects: Map<string, Project> = new Map();
  private userProjects: Map<string, Set<string>> = new Map(); // uuid -> project IDs
  
  // Project limits
  private readonly MAX_PROJECTS_PER_USER = 20;
  private readonly MAX_TOTAL_PROJECTS = 200;

  constructor() {
    super();
    this.loadProjects();
  }

  createProject(uuid: string, name: string, projectPath: string, options?: {
    description?: string;
    color?: string;
    type?: 'local' | 'git' | 'new-git' | 'clone-git' | 'open-git';
    gitUrl?: string;
    gitBranch?: string;
    settings?: Partial<ProjectSettings>;
  }): Project {
    this.enforceProjectLimits(uuid);

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Handle different project types
    const projectType = options?.type || this.detectProjectType(projectPath);
    
    // Validate or create project path based on type
    if (projectType === 'new-git') {
      // Create new git repository
      this.createNewGitRepository(projectPath);
    } else if (projectType === 'clone-git') {
      // Clone existing repository
      if (!options?.gitUrl) {
        throw new Error('Git URL is required for cloning repositories');
      }
      this.cloneGitRepository(options.gitUrl, projectPath, options.gitBranch);
    } else if (projectType === 'open-git') {
      // Validate existing git repository
      if (!this.isValidProjectPath(projectPath)) {
        throw new Error('Invalid project path. Path must exist and be accessible.');
      }
      if (!this.isGitRepository(projectPath)) {
        throw new Error('The selected directory is not a Git repository.');
      }
    } else {
      // Validate existing path
      if (!this.isValidProjectPath(projectPath)) {
        throw new Error('Invalid project path. Path must exist and be accessible.');
      }
    }

    // Create project object
    const project: Project = {
      id: projectId,
      name: name.trim(),
      description: options?.description?.trim(),
      path: path.resolve(projectPath),
      color: options?.color || this.getDefaultColor(),
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      type: projectType,
      settings: {
        defaultShell: options?.settings?.defaultShell,
        workingDirectory: projectPath,
        environmentVariables: options?.settings?.environmentVariables || {},
        terminalSettings: {
          cols: 80,
          rows: 24,
          fontSize: 14,
          ...options?.settings?.terminalSettings
        }
      },
      gitRepo: this.getGitInfo(projectPath)
    };

    // Store project
    this.projects.set(projectId, project);
    
    // Track user projects
    if (!this.userProjects.has(uuid)) {
      this.userProjects.set(uuid, new Set());
    }
    this.userProjects.get(uuid)!.add(projectId);

    // Save to disk
    this.saveProjects();

    this.emit('project_created', uuid, project);
    
    return project;
  }

  getProject(uuid: string, projectId: string): Project | undefined {
    const userProjectIds = this.userProjects.get(uuid);
    if (!userProjectIds || !userProjectIds.has(projectId)) {
      return undefined;
    }
    
    return this.projects.get(projectId);
  }

  getUserProjects(uuid: string): Project[] {
    const userProjectIds = this.userProjects.get(uuid);
    if (!userProjectIds) {
      return [];
    }

    const projects: Project[] = [];
    for (const projectId of userProjectIds) {
      const project = this.projects.get(projectId);
      if (project) {
        projects.push(project);
      }
    }

    return projects.sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime());
  }

  updateProject(uuid: string, projectId: string, updates: Partial<Project>): boolean {
    const project = this.getProject(uuid, projectId);
    if (!project) {
      return false;
    }

    // Update allowed fields
    if (updates.name) project.name = updates.name.trim();
    if (updates.description !== undefined) project.description = updates.description?.trim();
    if (updates.color) project.color = updates.color;
    if (updates.settings) {
      project.settings = { ...project.settings, ...updates.settings };
    }

    project.lastAccessedAt = new Date();
    this.saveProjects();
    
    this.emit('project_updated', uuid, project);
    return true;
  }

  deleteProject(uuid: string, projectId: string): boolean {
    const project = this.getProject(uuid, projectId);
    if (!project) {
      return false;
    }

    // Remove from storage
    this.projects.delete(projectId);
    
    // Remove from user tracking
    const userProjectIds = this.userProjects.get(uuid);
    if (userProjectIds) {
      userProjectIds.delete(projectId);
      if (userProjectIds.size === 0) {
        this.userProjects.delete(uuid);
      }
    }

    this.saveProjects();
    
    this.emit('project_deleted', uuid, project);
    return true;
  }

  accessProject(uuid: string, projectId: string): Project | undefined {
    const project = this.getProject(uuid, projectId);
    if (project) {
      project.lastAccessedAt = new Date();
      this.saveProjects();
      this.emit('project_accessed', uuid, project);
    }
    return project;
  }

  private enforceProjectLimits(uuid: string): void {
    // Check total project limit
    if (this.projects.size >= this.MAX_TOTAL_PROJECTS) {
      throw new Error(`Maximum total projects reached (${this.MAX_TOTAL_PROJECTS}). Please delete some projects.`);
    }

    // Check per-user project limit
    const userProjectIds = this.userProjects.get(uuid);
    if (userProjectIds && userProjectIds.size >= this.MAX_PROJECTS_PER_USER) {
      throw new Error(`Maximum projects per user reached (${this.MAX_PROJECTS_PER_USER}). Please delete some projects first.`);
    }
  }

  private isValidProjectPath(projectPath: string): boolean {
    try {
      const stats = fs.statSync(projectPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private detectProjectType(projectPath: string): 'local' | 'git' {
    try {
      const gitPath = path.join(projectPath, '.git');
      const stats = fs.statSync(gitPath);
      return stats.isDirectory() ? 'git' : 'local';
    } catch {
      return 'local';
    }
  }

  private getGitInfo(projectPath: string): GitRepository | undefined {
    if (this.detectProjectType(projectPath) !== 'git') {
      return undefined;
    }

    // This is a simplified implementation
    // In a real implementation, you'd use a git library like 'simple-git'
    return {
      url: '',
      branch: 'main',
      status: 'clean'
    };
  }

  private getDefaultColor(): string {
    const colors = ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'indigo', 'teal'];
    const usedColors = Array.from(this.projects.values()).map(p => p.color);
    return colors.find(c => !usedColors.includes(c)) || colors[0];
  }

  private loadProjects(): void {
    // In a real implementation, this would load from a database or file
    // For now, we'll start with empty state
  }

  private saveProjects(): void {
    // In a real implementation, this would save to a database or file
    // For now, we'll just emit an event
    this.emit('projects_saved');
  }

  getResourceUsage(): {
    totalProjects: number;
    projectsByUser: Map<string, number>;
    limits: {
      maxProjectsPerUser: number;
      maxTotalProjects: number;
    }
  } {
    const projectsByUser = new Map<string, number>();
    for (const [uuid, projectIds] of this.userProjects.entries()) {
      projectsByUser.set(uuid, projectIds.size);
    }

    return {
      totalProjects: this.projects.size,
      projectsByUser,
      limits: {
        maxProjectsPerUser: this.MAX_PROJECTS_PER_USER,
        maxTotalProjects: this.MAX_TOTAL_PROJECTS
      }
    };
  }

  destroy(): void {
    this.projects.clear();
    this.userProjects.clear();
    this.removeAllListeners();
  }

  // Git operations
  private createNewGitRepository(projectPath: string): void {
    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }

      // Check if directory is empty
      const files = fs.readdirSync(projectPath);
      if (files.length > 0) {
        throw new Error('Directory must be empty to initialize a new Git repository');
      }

      // Initialize git repository
      // For now, we'll create a simple marker file
      // In a real implementation, you'd use a git library or spawn git commands
      const gitPath = path.join(projectPath, '.git');
      fs.mkdirSync(gitPath, { recursive: true });
      
      // Create a basic git config
      const gitConfig = `[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
	logallrefupdates = true
[user]
	name = DuckBridge User
	email = user@duckbridge.local
`;
      fs.writeFileSync(path.join(gitPath, 'config'), gitConfig);
      
      // Create initial README
      const readmePath = path.join(projectPath, 'README.md');
      fs.writeFileSync(readmePath, `# ${path.basename(projectPath)}\n\nCreated with DuckBridge\n`);
      
      console.log(`Created new Git repository at: ${projectPath}`);
    } catch (error) {
      throw new Error(`Failed to create Git repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private cloneGitRepository(gitUrl: string, projectPath: string, branch?: string): void {
    try {
      // Create parent directory if it doesn't exist
      const parentDir = path.dirname(projectPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // For now, we'll create a mock clone
      // In a real implementation, you'd use a git library or spawn git clone commands
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }

      // Create mock git structure
      const gitPath = path.join(projectPath, '.git');
      fs.mkdirSync(gitPath, { recursive: true });
      
      // Store clone information
      const gitConfig = `[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
	logallrefupdates = true
[remote "origin"]
	url = ${gitUrl}
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "${branch || 'main'}"]
	remote = origin
	merge = refs/heads/${branch || 'main'}
`;
      fs.writeFileSync(path.join(gitPath, 'config'), gitConfig);
      
      // Create README indicating this is a clone
      const readmePath = path.join(projectPath, 'README.md');
      fs.writeFileSync(readmePath, `# Cloned Repository\n\nCloned from: ${gitUrl}\nBranch: ${branch || 'main'}\nCloned with DuckBridge\n`);
      
      console.log(`Cloned repository ${gitUrl} to: ${projectPath}`);
    } catch (error) {
      throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Directory browsing for repository selection
  browseDirectory(directoryPath: string, projectType?: string): Array<{
    name: string;
    path: string;
    type: 'directory' | 'file';
    isGitRepo?: boolean;
  }> {
    try {
      // Validate path exists and is accessible
      if (!fs.existsSync(directoryPath)) {
        throw new Error('Directory does not exist');
      }

      const stats = fs.statSync(directoryPath);
      if (!stats.isDirectory()) {
        throw new Error('Path is not a directory');
      }

      const items: Array<{
        name: string;
        path: string;
        type: 'directory' | 'file';
        isGitRepo?: boolean;
      }> = [];

      const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and directories unless they're git-related
        if (entry.name.startsWith('.') && entry.name !== '.git') {
          continue;
        }

        const itemPath = path.join(directoryPath, entry.name);
        
        if (entry.isDirectory()) {
          // Check if this directory is a git repository
          const isGitRepo = this.isGitRepository(itemPath);
          
          items.push({
            name: entry.name,
            path: itemPath,
            type: 'directory',
            isGitRepo
          });
        } else if (entry.isFile()) {
          // Only include certain files for context
          const relevantFiles = ['.gitignore', 'README.md', 'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod'];
          
          if (relevantFiles.includes(entry.name)) {
            items.push({
              name: entry.name,
              path: itemPath,
              type: 'file'
            });
          }
        }
      }

      // Sort items: directories first, then by name
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        
        // If both are directories, prioritize git repos
        if (a.type === 'directory' && projectType === 'open-git') {
          if (a.isGitRepo && !b.isGitRepo) return -1;
          if (!a.isGitRepo && b.isGitRepo) return 1;
        }
        
        return a.name.localeCompare(b.name);
      });

      return items;
    } catch (error) {
      throw new Error(`Failed to browse directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Enhanced git repository detection
  private isGitRepository(directoryPath: string): boolean {
    try {
      const gitPath = path.join(directoryPath, '.git');
      const stats = fs.statSync(gitPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}