import path from 'path';
import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export interface Project {
  id: string;
  name: string;
  path: string;
  type: 'git' | 'local' | 'template';
  description?: string;
  language?: string;
  framework?: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface CreateProjectOptions {
  name: string;
  type: 'git' | 'local' | 'template';
  gitUrl?: string;
  templateId?: string;
  description?: string;
  targetPath?: string;
}

export class ProjectManager {
  private dataDir: string;
  private projectsFile: string;
  private projects: Map<string, Project> = new Map();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.projectsFile = path.join(dataDir, 'projects.json');
    this.initializeProjectsDir();
    this.loadProjects();
  }

  private async initializeProjectsDir(): Promise<void> {
    try {
      if (!existsSync(this.dataDir)) {
        await mkdir(this.dataDir, { recursive: true });
      }
    } catch (error) {
      logger.error('Failed to initialize projects directory:', error);
    }
  }

  private async loadProjects(): Promise<void> {
    try {
      if (existsSync(this.projectsFile)) {
        const data = await readFile(this.projectsFile, 'utf-8');
        const projectsData = JSON.parse(data);

        for (const projectData of projectsData) {
          const project: Project = {
            ...projectData,
            createdAt: new Date(projectData.createdAt),
            lastAccessedAt: new Date(projectData.lastAccessedAt),
          };
          this.projects.set(project.id, project);
        }

        logger.info(`Loaded ${this.projects.size} projects`);
      }
    } catch (error) {
      logger.error('Failed to load projects:', error);
    }
  }

  private async saveProjects(): Promise<void> {
    try {
      const projectsData = Array.from(this.projects.values()).map(project => ({
        ...project,
        createdAt: project.createdAt.toISOString(),
        lastAccessedAt: project.lastAccessedAt.toISOString(),
      }));

      await writeFile(this.projectsFile, JSON.stringify(projectsData, null, 2));
      logger.debug('Projects saved successfully');
    } catch (error) {
      logger.error('Failed to save projects:', error);
    }
  }

  async getProjects(): Promise<Project[]> {
    // Update project info by scanning directories
    await this.scanProjectDirectories();
    return Array.from(this.projects.values());
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const project = this.projects.get(projectId);
    if (project) {
      project.lastAccessedAt = new Date();
      await this.saveProjects();
    }
    return project;
  }

  async createProject(options: CreateProjectOptions): Promise<Project> {
    const projectId = uuidv4();
    const projectPath =
      options.targetPath || path.join(this.dataDir, 'projects', options.name);

    const project: Project = {
      id: projectId,
      name: options.name,
      path: projectPath,
      type: options.type,
      description: options.description,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };

    try {
      switch (options.type) {
        case 'git':
          if (!options.gitUrl) {
            throw new Error('Git URL is required for git projects');
          }
          await this.cloneGitProject(options.gitUrl, projectPath);
          break;

        case 'local':
          await this.createLocalProject(projectPath);
          break;

        case 'template':
          if (!options.templateId) {
            throw new Error('Template ID is required for template projects');
          }
          await this.createFromTemplate(options.templateId, projectPath);
          break;

        default:
          throw new Error(`Unknown project type: ${options.type}`);
      }

      // Detect project details
      await this.detectProjectDetails(project);

      this.projects.set(projectId, project);
      await this.saveProjects();

      logger.info(`Created project: ${project.name}`, {
        id: projectId,
        path: projectPath,
      });
      return project;
    } catch (error) {
      logger.error(`Failed to create project: ${options.name}`, error);
      throw error;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    this.projects.delete(projectId);
    await this.saveProjects();

    logger.info(`Deleted project: ${project.name}`, { id: projectId });
  }

  private async cloneGitProject(
    gitUrl: string,
    targetPath: string
  ): Promise<void> {
    const { spawn } = await import('child_process');

    return new Promise((resolve, reject) => {
      const child = spawn('git', ['clone', gitUrl, targetPath], {
        stdio: 'pipe',
      });

      child.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Git clone failed with code ${code}`));
        }
      });

      child.on('error', error => {
        reject(error);
      });
    });
  }

  private async createLocalProject(projectPath: string): Promise<void> {
    await mkdir(projectPath, { recursive: true });

    // Create basic project structure
    await writeFile(
      path.join(projectPath, 'README.md'),
      `# ${path.basename(projectPath)}\n\nA new project created with Vibe Code.\n`
    );
  }

  private async createFromTemplate(
    templateId: string,
    projectPath: string
  ): Promise<void> {
    // For now, just create a basic structure
    // TODO: Implement proper template system
    await this.createLocalProject(projectPath);
  }

  private async detectProjectDetails(project: Project): Promise<void> {
    try {
      const packageJsonPath = path.join(project.path, 'package.json');
      const cargoTomlPath = path.join(project.path, 'Cargo.toml');
      const pyprojectTomlPath = path.join(project.path, 'pyproject.toml');

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          await readFile(packageJsonPath, 'utf-8')
        );
        project.language = 'javascript';

        // Detect framework
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        if (deps.react) project.framework = 'react';
        else if (deps.vue) project.framework = 'vue';
        else if (deps.angular) project.framework = 'angular';
        else if (deps.express) project.framework = 'express';
        else if (deps.next) project.framework = 'next.js';
      } else if (existsSync(cargoTomlPath)) {
        project.language = 'rust';
      } else if (existsSync(pyprojectTomlPath)) {
        project.language = 'python';
      } else if (existsSync(path.join(project.path, 'go.mod'))) {
        project.language = 'go';
      }
    } catch (error) {
      logger.debug(
        `Could not detect project details for ${project.name}:`,
        error
      );
    }
  }

  private async scanProjectDirectories(): Promise<void> {
    const projectsDir = path.join(this.dataDir, 'projects');

    try {
      if (!existsSync(projectsDir)) {
        return;
      }

      const entries = await readdir(projectsDir);

      for (const entry of entries) {
        const entryPath = path.join(projectsDir, entry);
        const stats = await stat(entryPath);

        if (stats.isDirectory()) {
          // Check if this is a known project
          const existingProject = Array.from(this.projects.values()).find(
            p => p.path === entryPath
          );

          if (!existingProject) {
            // Create project entry for unknown directory
            const project: Project = {
              id: uuidv4(),
              name: entry,
              path: entryPath,
              type: 'local',
              createdAt: stats.birthtime,
              lastAccessedAt: stats.atime,
            };

            await this.detectProjectDetails(project);
            this.projects.set(project.id, project);
          }
        }
      }

      await this.saveProjects();
    } catch (error) {
      logger.debug('Error scanning project directories:', error);
    }
  }
}
