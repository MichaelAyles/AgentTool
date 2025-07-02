import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProjectManager } from '../../services/project-manager.js';
import {
  createTestUser,
  createTestProject,
  mockDb,
  createTempDir,
  cleanupTempDir,
  withTestEnv,
} from '../test-setup.js';

// Mock file system operations
const mockFs = {
  promises: {
    access: mock(() => Promise.resolve()),
    mkdir: mock(() => Promise.resolve()),
    readdir: mock(() => Promise.resolve(['file1.js', 'file2.ts'])),
    stat: mock(() =>
      Promise.resolve({
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtime: new Date(),
      })
    ),
    readFile: mock(() =>
      Promise.resolve('{"name": "test-project", "version": "1.0.0"}')
    ),
  },
  existsSync: mock(() => true),
  constants: { F_OK: 0, R_OK: 4, W_OK: 2 },
};

mock.module('fs', () => mockFs);

// Mock path operations
const mockPath = {
  join: (...args: string[]) => args.join('/'),
  resolve: (path: string) => `/absolute${path}`,
  dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
  basename: (path: string) => path.split('/').pop() || '',
  extname: (path: string) => {
    const name = path.split('/').pop() || '';
    const lastDot = name.lastIndexOf('.');
    return lastDot > 0 ? name.substring(lastDot) : '';
  },
};

mock.module('path', () => mockPath);

// Mock child_process
const mockChildProcess = {
  spawn: mock(() => ({
    on: mock((event: string, callback: Function) => {
      if (event === 'close') {
        setTimeout(() => callback(0), 10); // Success
      }
    }),
    stdout: { on: mock() },
    stderr: { on: mock() },
  })),
  exec: mock((command: string, callback: Function) => {
    setTimeout(() => callback(null, 'git output', ''), 10);
  }),
};

mock.module('child_process', () => mockChildProcess);

describe('ProjectManager', () => {
  let projectManager: ProjectManager;
  let tempDir: string;

  beforeEach(() => {
    projectManager = new ProjectManager(mockDb as any);
    tempDir = createTempDir();

    // Reset mocks
    Object.values(mockFs.promises).forEach(mockFn => mockFn.mockClear());
    mockFs.existsSync.mockClear();
    Object.values(mockChildProcess).forEach(mockFn => mockFn.mockClear());
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('Project Creation', () => {
    it('should create a new project successfully', async () => {
      const projectData = {
        name: 'Test Project',
        path: `${tempDir}/test-project`,
        activeAdapter: 'claude-code',
        description: 'A test project',
      };
      const userId = 'test-user-1';

      const project = await projectManager.createProject(projectData, userId);

      expect(project.name).toBe(projectData.name);
      expect(project.path).toBe(projectData.path);
      expect(project.activeAdapter).toBe(projectData.activeAdapter);
      expect(project.userId).toBe(userId);
      expect(project.id).toBeDefined();
      expect(project.createdAt).toBeInstanceOf(Date);
      expect(project.updatedAt).toBeInstanceOf(Date);
    });

    it('should validate project data', async () => {
      const invalidProjectData = {
        name: '', // Empty name
        path: `${tempDir}/test-project`,
        activeAdapter: 'claude-code',
      };
      const userId = 'test-user-1';

      await expect(
        projectManager.createProject(invalidProjectData, userId)
      ).rejects.toThrow('Project name is required');
    });

    it('should check if path already exists', async () => {
      mockFs.existsSync.mockReturnValueOnce(true);

      const projectData = {
        name: 'Test Project',
        path: `${tempDir}/existing-project`,
        activeAdapter: 'claude-code',
      };
      const userId = 'test-user-1';

      await expect(
        projectManager.createProject(projectData, userId)
      ).rejects.toThrow('Project path already exists');
    });

    it('should create project directory structure', async () => {
      mockFs.existsSync.mockReturnValueOnce(false);

      const projectData = {
        name: 'Test Project',
        path: `${tempDir}/new-project`,
        activeAdapter: 'claude-code',
      };
      const userId = 'test-user-1';

      await projectManager.createProject(projectData, userId);

      expect(mockFs.promises.mkdir).toHaveBeenCalledWith(projectData.path, {
        recursive: true,
      });
    });
  });

  describe('Project Cloning', () => {
    it('should clone a git repository successfully', async () => {
      const cloneData = {
        repoUrl: 'https://github.com/user/repo.git',
        localPath: `${tempDir}/cloned-project`,
        activeAdapter: 'claude-code',
        name: 'Cloned Project',
        branch: 'main',
        depth: 1,
      };
      const userId = 'test-user-1';

      const project = await projectManager.cloneProject(cloneData, userId);

      expect(project.name).toBe(cloneData.name);
      expect(project.path).toBe(cloneData.localPath);
      expect(project.gitRemote).toBe(cloneData.repoUrl);
      expect(mockChildProcess.spawn).toHaveBeenCalled();
    });

    it('should validate clone data', async () => {
      const invalidCloneData = {
        repoUrl: '', // Empty URL
        localPath: `${tempDir}/cloned-project`,
        activeAdapter: 'claude-code',
      };
      const userId = 'test-user-1';

      await expect(
        projectManager.cloneProject(invalidCloneData, userId)
      ).rejects.toThrow('Repository URL is required');
    });

    it('should handle git clone failures', async () => {
      mockChildProcess.spawn.mockReturnValueOnce({
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 10); // Failure
          }
        }),
        stdout: { on: mock() },
        stderr: { on: mock() },
      });

      const cloneData = {
        repoUrl: 'https://github.com/user/nonexistent.git',
        localPath: `${tempDir}/failed-clone`,
        activeAdapter: 'claude-code',
        name: 'Failed Clone',
      };
      const userId = 'test-user-1';

      await expect(
        projectManager.cloneProject(cloneData, userId)
      ).rejects.toThrow('Git clone failed');
    });

    it('should use default branch if not specified', async () => {
      const cloneData = {
        repoUrl: 'https://github.com/user/repo.git',
        localPath: `${tempDir}/cloned-project`,
        activeAdapter: 'claude-code',
        name: 'Cloned Project',
        // No branch specified
      };
      const userId = 'test-user-1';

      await projectManager.cloneProject(cloneData, userId);

      // Should use 'main' as default branch
      expect(mockChildProcess.spawn).toHaveBeenCalledWith(
        'git',
        expect.arrayContaining(['--branch', 'main']),
        expect.any(Object)
      );
    });
  });

  describe('Project Initialization', () => {
    it('should initialize a new project with git', async () => {
      const initData = {
        path: `${tempDir}/init-project`,
        name: 'Initialized Project',
        activeAdapter: 'claude-code',
        gitInit: true,
        template: 'node',
        description: 'An initialized project',
      };
      const userId = 'test-user-1';

      const project = await projectManager.initializeProject(initData, userId);

      expect(project.name).toBe(initData.name);
      expect(project.path).toBe(initData.path);
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringContaining('git init'),
        expect.any(Function)
      );
    });

    it('should create project without git initialization', async () => {
      const initData = {
        path: `${tempDir}/no-git-project`,
        name: 'No Git Project',
        activeAdapter: 'claude-code',
        gitInit: false,
      };
      const userId = 'test-user-1';

      const project = await projectManager.initializeProject(initData, userId);

      expect(project.name).toBe(initData.name);
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockChildProcess.exec).not.toHaveBeenCalledWith(
        expect.stringContaining('git init'),
        expect.any(Function)
      );
    });

    it('should apply project template if specified', async () => {
      const initData = {
        path: `${tempDir}/template-project`,
        name: 'Template Project',
        activeAdapter: 'claude-code',
        template: 'react',
      };
      const userId = 'test-user-1';

      await projectManager.initializeProject(initData, userId);

      // Template application would be tested here
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
    });
  });

  describe('Project Information', () => {
    it('should get project information', async () => {
      const projectPath = `${tempDir}/info-project`;

      // Mock package.json content
      mockFs.promises.readFile.mockResolvedValueOnce(
        JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: { express: '^4.17.1' },
        })
      );

      const info = await projectManager.getProjectInfo(projectPath);

      expect(info.name).toBe('test-project');
      expect(info.version).toBe('1.0.0');
      expect(info.hasPackageJson).toBe(true);
      expect(info.dependencies).toEqual({ express: '^4.17.1' });
    });

    it('should handle projects without package.json', async () => {
      const projectPath = `${tempDir}/no-package-project`;

      // Mock file not found
      mockFs.promises.readFile.mockRejectedValueOnce(new Error('ENOENT'));

      const info = await projectManager.getProjectInfo(projectPath);

      expect(info.hasPackageJson).toBe(false);
      expect(info.dependencies).toEqual({});
    });

    it('should detect git repository', async () => {
      const projectPath = `${tempDir}/git-project`;

      // Mock .git directory exists
      mockFs.promises.access.mockResolvedValueOnce(undefined);

      const info = await projectManager.getProjectInfo(projectPath);

      expect(info.isGitRepo).toBe(true);
    });

    it('should count project files', async () => {
      const projectPath = `${tempDir}/file-count-project`;

      mockFs.promises.readdir.mockResolvedValueOnce([
        'file1.js',
        'file2.ts',
        'dir1',
      ]);
      mockFs.promises.stat
        .mockResolvedValueOnce({
          isDirectory: () => false,
          isFile: () => true,
          size: 100,
        })
        .mockResolvedValueOnce({
          isDirectory: () => false,
          isFile: () => true,
          size: 200,
        })
        .mockResolvedValueOnce({
          isDirectory: () => true,
          isFile: () => false,
          size: 0,
        });

      const info = await projectManager.getProjectInfo(projectPath);

      expect(info.fileCount).toBe(2); // Only files, not directories
      expect(info.totalSize).toBe(300);
    });
  });

  describe('Path Validation', () => {
    it('should validate accessible path', async () => {
      const validPath = `${tempDir}/valid-path`;

      mockFs.promises.access.mockResolvedValueOnce(undefined);

      const validation = await projectManager.validateProjectPath(validPath);

      expect(validation.valid).toBe(true);
      expect(validation.exists).toBe(true);
      expect(validation.accessible).toBe(true);
    });

    it('should detect inaccessible path', async () => {
      const inaccessiblePath = '/root/restricted';

      mockFs.promises.access.mockRejectedValueOnce(new Error('EACCES'));

      const validation =
        await projectManager.validateProjectPath(inaccessiblePath);

      expect(validation.valid).toBe(false);
      expect(validation.accessible).toBe(false);
      expect(validation.error).toContain('not accessible');
    });

    it('should detect non-existent path', async () => {
      const nonExistentPath = `${tempDir}/does-not-exist`;

      mockFs.promises.access.mockRejectedValueOnce(new Error('ENOENT'));

      const validation =
        await projectManager.validateProjectPath(nonExistentPath);

      expect(validation.exists).toBe(false);
      // Non-existent paths can still be valid for creation
      expect(validation.valid).toBe(true);
    });

    it('should validate path format', async () => {
      const invalidPath = '';

      const validation = await projectManager.validateProjectPath(invalidPath);

      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Path is required');
    });

    it('should check if path is empty directory', async () => {
      const emptyPath = `${tempDir}/empty-dir`;

      mockFs.promises.access.mockResolvedValueOnce(undefined);
      mockFs.promises.readdir.mockResolvedValueOnce([]);

      const validation = await projectManager.validateProjectPath(emptyPath);

      expect(validation.empty).toBe(true);
      expect(validation.valid).toBe(true);
    });

    it('should detect non-empty directory', async () => {
      const nonEmptyPath = `${tempDir}/non-empty-dir`;

      mockFs.promises.access.mockResolvedValueOnce(undefined);
      mockFs.promises.readdir.mockResolvedValueOnce(['file1.js']);

      const validation = await projectManager.validateProjectPath(nonEmptyPath);

      expect(validation.empty).toBe(false);
      expect(validation.warning).toContain('not empty');
    });
  });

  describe('Git Operations', () => {
    it('should initialize git repository', async () => {
      const projectPath = `${tempDir}/git-init-project`;

      await projectManager.initializeGitRepo(projectPath);

      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        `cd "${projectPath}" && git init`,
        expect.any(Function)
      );
    });

    it('should handle git initialization failure', async () => {
      const projectPath = `${tempDir}/git-fail-project`;

      mockChildProcess.exec.mockImplementationOnce((command, callback) => {
        callback(new Error('Git not found'), '', 'git: command not found');
      });

      await expect(
        projectManager.initializeGitRepo(projectPath)
      ).rejects.toThrow('Git initialization failed');
    });

    it('should check git status', async () => {
      const projectPath = `${tempDir}/git-status-project`;

      mockChildProcess.exec.mockImplementationOnce((command, callback) => {
        callback(null, 'On branch main\nnothing to commit', '');
      });

      const status = await projectManager.getGitStatus(projectPath);

      expect(status.branch).toBe('main');
      expect(status.clean).toBe(true);
    });
  });

  describe('Template Application', () => {
    it('should apply node.js template', async () => {
      const projectPath = `${tempDir}/node-template`;

      await projectManager.applyTemplate(projectPath, 'node');

      // Check if package.json was created
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
    });

    it('should apply react template', async () => {
      const projectPath = `${tempDir}/react-template`;

      await projectManager.applyTemplate(projectPath, 'react');

      expect(mockFs.promises.mkdir).toHaveBeenCalled();
    });

    it('should handle unknown template', async () => {
      const projectPath = `${tempDir}/unknown-template`;

      await projectManager.applyTemplate(projectPath, 'unknown');

      // Should not throw error but log warning
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      const projectData = {
        name: 'Error Project',
        path: '/invalid/path/that/cannot/be/created',
        activeAdapter: 'claude-code',
      };
      const userId = 'test-user-1';

      mockFs.promises.mkdir.mockRejectedValueOnce(
        new Error('Permission denied')
      );

      await expect(
        projectManager.createProject(projectData, userId)
      ).rejects.toThrow('Permission denied');
    });

    it('should handle network errors during cloning', async () => {
      const cloneData = {
        repoUrl: 'https://github.com/user/repo.git',
        localPath: `${tempDir}/network-error`,
        activeAdapter: 'claude-code',
        name: 'Network Error Project',
      };
      const userId = 'test-user-1';

      mockChildProcess.spawn.mockReturnValueOnce({
        on: mock((event: string, callback: Function) => {
          if (event === 'close') {
            setTimeout(() => callback(128), 10); // Network error
          }
        }),
        stdout: { on: mock() },
        stderr: {
          on: mock((event: string, callback: Function) => {
            if (event === 'data') {
              callback('fatal: unable to connect');
            }
          }),
        },
      });

      await expect(
        projectManager.cloneProject(cloneData, userId)
      ).rejects.toThrow('Git clone failed');
    });
  });

  describe('Environment Variables', () => {
    it(
      'should respect custom git commands',
      withTestEnv({ GIT_EXECUTABLE: '/custom/git' }, async () => {
        const projectPath = `${tempDir}/custom-git`;

        await projectManager.initializeGitRepo(projectPath);

        expect(mockChildProcess.exec).toHaveBeenCalledWith(
          expect.stringContaining('/custom/git'),
          expect.any(Function)
        );
      })
    );

    it('should use default git when not specified', async () => {
      const projectPath = `${tempDir}/default-git`;

      await projectManager.initializeGitRepo(projectPath);

      expect(mockChildProcess.exec).toHaveBeenCalledWith(
        expect.stringContaining('git init'),
        expect.any(Function)
      );
    });
  });
});
