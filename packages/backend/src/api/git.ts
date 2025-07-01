import { Router } from 'express';
import simpleGit, { SimpleGit } from 'simple-git';
import { join } from 'path';
import { promises as fs } from 'fs';
import { GitStatusVisualizer } from '../services/git-status-visualizer.js';
import { GitOperations } from '../services/git-operations.js';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import { comprehensiveAuditLogger, AuditCategory } from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';

const router = Router();

// Git operations for a specific project
async function getGitInstance(projectPath: string): Promise<SimpleGit> {
  try {
    // Validate that the path exists
    await fs.access(projectPath);
    return simpleGit(projectPath);
  } catch (error) {
    throw new Error(`Invalid project path: ${projectPath}`);
  }
}

// GET /api/git/:projectPath/status - Get basic git status
router.get('/status/:projectPath(*)', authenticate, requirePermission('git', 'read'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    
    const status = await git.status();
    
    res.json({
      success: true,
      data: {
        current: status.current,
        tracking: status.tracking,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        not_added: status.not_added,
        deleted: status.deleted,
        renamed: status.renamed,
        conflicted: status.conflicted,
        created: status.created,
        isClean: status.isClean(),
      }
    });
  } catch (error) {
    console.error('Git status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get git status'
    });
  }
});

// GET /api/git/:projectPath/status/visualization - Get enhanced git status with visualization
router.get('/status/:projectPath(*)/visualization', authenticate, requirePermission('git', 'read'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    const visualizer = new GitStatusVisualizer(git, projectPath);
    
    const visualization = await visualizer.generateVisualization();
    
    await comprehensiveAuditLogger.logAuditEvent({
      category: AuditCategory.DATA_ACCESS,
      action: 'git_status_visualization_accessed',
      resourceType: 'git_repository',
      resourceId: projectPath,
      userId: req.user?.id,
      sessionId: req.session?.id || req.sessionID,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: SecurityLevel.SAFE,
      details: {
        projectPath,
        branch: visualization.branch.current,
        totalChanges: visualization.workingTree.totalChanges,
      },
    });
    
    res.json({
      success: true,
      data: visualization,
    });
  } catch (error) {
    console.error('Git status visualization error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get git status visualization'
    });
  }
});

// GET /api/git/:projectPath/tree - Get git change tree structure
router.get('/tree/:projectPath(*)', authenticate, requirePermission('git', 'read'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    const visualizer = new GitStatusVisualizer(git, projectPath);
    
    const tree = await visualizer.buildChangeTree();
    
    res.json({
      success: true,
      data: tree,
    });
  } catch (error) {
    console.error('Git tree error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get git tree'
    });
  }
});

// GET /api/git/:projectPath/diff/:filePath - Get file diff
router.get('/diff/:projectPath(*)', authenticate, requirePermission('git', 'read'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { file, staged = 'false' } = req.query;
    
    if (!file || typeof file !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'File parameter is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const visualizer = new GitStatusVisualizer(git, projectPath);
    
    const diff = await visualizer.getFileDiff(file, staged === 'true');
    
    res.json({
      success: true,
      data: {
        file,
        staged: staged === 'true',
        ...diff,
      },
    });
  } catch (error) {
    console.error('Git diff error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get file diff'
    });
  }
});

// GET /api/git/:projectPath/branches - Get all branches
router.get('/branches/:projectPath(*)', authenticate, requirePermission('git', 'read'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    
    const branches = await git.branch(['-a']);
    
    res.json({
      success: true,
      data: {
        current: branches.current,
        all: branches.all,
        branches: branches.branches,
      }
    });
  } catch (error) {
    console.error('Git branches error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get branches'
    });
  }
});

// GET /api/git/:projectPath/history - Get enhanced commit history
router.get('/history/:projectPath(*)', authenticate, requirePermission('git', 'read'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { maxCount, since, until, author, path } = req.query;
    
    const git = await getGitInstance(projectPath);
    const visualizer = new GitStatusVisualizer(git, projectPath);
    
    const options = {
      maxCount: maxCount ? parseInt(maxCount as string, 10) : undefined,
      since: since as string,
      until: until as string,
      author: author as string,
      path: path as string,
    };
    
    const commits = await visualizer.getCommitHistory(options);
    
    res.json({
      success: true,
      data: {
        commits,
        count: commits.length,
        filters: options,
      },
    });
  } catch (error) {
    console.error('Git commit history error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get commit history'
    });
  }
});

// GET /api/git/:projectPath/log - Get basic commit history (legacy)
router.get('/log/:projectPath(*)', authenticate, requirePermission('git', 'read'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    
    const { maxCount = '20', from, to } = req.query;
    
    const logOptions: any = {
      maxCount: parseInt(maxCount as string, 10)
    };
    
    if (from) logOptions.from = from;
    if (to) logOptions.to = to;
    
    const log = await git.log(logOptions);
    
    res.json({
      success: true,
      data: {
        total: log.total,
        latest: log.latest,
        all: log.all.map(commit => ({
          hash: commit.hash,
          date: commit.date,
          message: commit.message,
          author: commit.author_name,
          email: commit.author_email,
          refs: commit.refs,
        }))
      }
    });
  } catch (error) {
    console.error('Git log error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get commit history'
    });
  }
});

// POST /api/git/:projectPath/add - Stage files
router.post('/add/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { files } = req.body;
    
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: 'Files array is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    // Add files (if files is ['.'], add all)
    const result = await git.add(files);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git add error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stage files'
    });
  }
});

// POST /api/git/:projectPath/commit - Create commit
router.post('/commit/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { message, author } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Commit message is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const commitOptions: any = { '--message': message };
    
    if (author && author.name && author.email) {
      commitOptions['--author'] = `${author.name} <${author.email}>`;
    }
    
    const result = await git.commit(message, undefined, commitOptions);
    
    res.json({
      success: true,
      data: {
        commit: result.commit,
        summary: result.summary,
        author: result.author,
        branch: result.branch,
        root: result.root,
      }
    });
  } catch (error) {
    console.error('Git commit error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create commit'
    });
  }
});

// POST /api/git/:projectPath/checkout - Checkout branch/commit
router.post('/checkout/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { branch, createBranch, commit } = req.body;
    
    if (!branch && !commit) {
      return res.status(400).json({
        success: false,
        error: 'Branch name or commit hash is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    let result;
    if (createBranch && branch) {
      result = await git.checkoutBranch(branch, commit || 'HEAD');
    } else if (branch) {
      result = await git.checkout(branch);
    } else if (commit) {
      result = await git.checkout(commit);
    }
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git checkout error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to checkout'
    });
  }
});

// POST /api/git/:projectPath/pull - Pull from remote
router.post('/pull/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { remote = 'origin', branch } = req.body;
    
    const git = await getGitInstance(projectPath);
    
    const result = branch 
      ? await git.pull(remote, branch)
      : await git.pull();
    
    res.json({
      success: true,
      data: {
        summary: result.summary,
        created: result.created,
        deleted: result.deleted,
        files: result.files,
        insertions: result.insertions,
        deletions: result.deletions,
      }
    });
  } catch (error) {
    console.error('Git pull error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pull from remote'
    });
  }
});

// POST /api/git/:projectPath/push - Push to remote
router.post('/push/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { remote = 'origin', branch, setUpstream = false } = req.body;
    
    const git = await getGitInstance(projectPath);
    
    const pushOptions: any = {};
    if (setUpstream) {
      pushOptions['--set-upstream'] = null;
    }
    
    const result = branch
      ? await git.push(remote, branch, pushOptions)
      : await git.push(pushOptions);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git push error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to push to remote'
    });
  }
});

// GET /api/git/:projectPath/diff - Get diff
router.get('/diff/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { staged = false, file, commit1, commit2 } = req.query;
    
    const git = await getGitInstance(projectPath);
    
    let diff;
    if (commit1 && commit2) {
      // Diff between two commits
      diff = await git.diff([`${commit1}..${commit2}`]);
    } else if (staged === 'true') {
      // Staged changes
      diff = await git.diff(['--staged']);
    } else if (file) {
      // Specific file diff
      diff = await git.diff(['--', file as string]);
    } else {
      // Working directory changes
      diff = await git.diff();
    }
    
    res.json({
      success: true,
      data: { diff }
    });
  } catch (error) {
    console.error('Git diff error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get diff'
    });
  }
});

// POST /api/git/:projectPath/init - Initialize git repository
router.post('/init/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { bare = false } = req.body;
    
    const git = simpleGit(projectPath);
    
    const result = await git.init(bare);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git init error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize git repository'
    });
  }
});

// POST /api/git/:projectPath/clone - Clone repository
router.post('/clone', async (req, res) => {
  try {
    const { repoUrl, localPath, branch } = req.body;
    
    if (!repoUrl || !localPath) {
      return res.status(400).json({
        success: false,
        error: 'Repository URL and local path are required'
      });
    }
    
    const git = simpleGit();
    
    const cloneOptions: any = {};
    if (branch) {
      cloneOptions['--branch'] = branch;
    }
    
    const result = await git.clone(repoUrl, localPath, cloneOptions);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git clone error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clone repository'
    });
  }
});

// GET /api/git/:projectPath/remotes - Get remote repositories
router.get('/remotes/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    
    const remotes = await git.getRemotes(true);
    
    res.json({
      success: true,
      data: remotes
    });
  } catch (error) {
    console.error('Git remotes error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get remotes'
    });
  }
});

// POST /api/git/:projectPath/branch - Create new branch
router.post('/branch/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { branchName, startPoint } = req.body;
    
    if (!branchName) {
      return res.status(400).json({
        success: false,
        error: 'Branch name is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const result = startPoint 
      ? await git.checkoutBranch(branchName, startPoint)
      : await git.checkoutLocalBranch(branchName);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git create branch error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create branch'
    });
  }
});

// DELETE /api/git/:projectPath/branch/:branchName - Delete branch
router.delete('/branch/:projectPath(*)/:branchName', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const branchName = req.params.branchName;
    const { force = false } = req.query;
    
    const git = await getGitInstance(projectPath);
    
    const deleteOptions = force === 'true' ? ['-D'] : ['-d'];
    const result = await git.deleteLocalBranch(branchName, deleteOptions);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git delete branch error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete branch'
    });
  }
});

// POST /api/git/:projectPath/branch/:branchName/rename - Rename branch
router.post('/branch/:projectPath(*)/:branchName/rename', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const oldName = req.params.branchName;
    const { newName } = req.body;
    
    if (!newName) {
      return res.status(400).json({
        success: false,
        error: 'New branch name is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const result = await git.branch(['-m', oldName, newName]);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git rename branch error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rename branch'
    });
  }
});

// POST /api/git/:projectPath/merge - Merge branch
router.post('/merge/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { branchName, noFastForward = false, squash = false, message } = req.body;
    
    if (!branchName) {
      return res.status(400).json({
        success: false,
        error: 'Branch name is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const mergeOptions: string[] = [];
    if (noFastForward) mergeOptions.push('--no-ff');
    if (squash) mergeOptions.push('--squash');
    if (message) mergeOptions.push('-m', message);
    
    const result = await git.merge([branchName, ...mergeOptions]);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git merge error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to merge branch'
    });
  }
});

// POST /api/git/:projectPath/rebase - Rebase current branch
router.post('/rebase/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { branch, interactive = false, onto } = req.body;
    
    const git = await getGitInstance(projectPath);
    
    const rebaseOptions: string[] = [];
    if (interactive) rebaseOptions.push('-i');
    if (onto) rebaseOptions.push('--onto', onto);
    if (branch) rebaseOptions.push(branch);
    
    const result = await git.rebase(rebaseOptions);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git rebase error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rebase'
    });
  }
});

// GET /api/git/:projectPath/worktrees - List worktrees
router.get('/worktrees/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    
    // Get worktree list
    const result = await git.raw(['worktree', 'list', '--porcelain']);
    
    // Parse worktree output
    const worktrees = [];
    const lines = result.split('\n').filter(line => line.trim());
    
    let currentWorktree: any = {};
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) worktrees.push(currentWorktree);
        currentWorktree = { path: line.replace('worktree ', '') };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.commit = line.replace('HEAD ', '');
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.replace('branch refs/heads/', '');
      } else if (line === 'bare') {
        currentWorktree.bare = true;
      } else if (line === 'detached') {
        currentWorktree.detached = true;
      } else if (line.startsWith('locked')) {
        currentWorktree.locked = line.includes(' ') ? line.split(' ')[1] : true;
      }
    }
    if (currentWorktree.path) worktrees.push(currentWorktree);
    
    res.json({
      success: true,
      data: worktrees
    });
  } catch (error) {
    console.error('Git worktrees error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get worktrees'
    });
  }
});

// POST /api/git/:projectPath/worktree - Add new worktree
router.post('/worktree/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { path, branch, newBranch, checkout = true } = req.body;
    
    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Worktree path is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const worktreeOptions: string[] = ['add'];
    if (!checkout) worktreeOptions.push('--no-checkout');
    if (newBranch) worktreeOptions.push('-b', newBranch);
    
    worktreeOptions.push(path);
    if (branch && !newBranch) worktreeOptions.push(branch);
    
    const result = await git.raw(['worktree', ...worktreeOptions]);
    
    res.json({
      success: true,
      data: { result, path, branch: newBranch || branch }
    });
  } catch (error) {
    console.error('Git add worktree error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add worktree'
    });
  }
});

// DELETE /api/git/:projectPath/worktree - Remove worktree
router.delete('/worktree/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { path, force = false } = req.body;
    
    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Worktree path is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const worktreeOptions: string[] = ['remove'];
    if (force) worktreeOptions.push('--force');
    worktreeOptions.push(path);
    
    const result = await git.raw(['worktree', ...worktreeOptions]);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git remove worktree error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove worktree'
    });
  }
});

// POST /api/git/:projectPath/worktree/lock - Lock worktree
router.post('/worktree/:projectPath(*)/lock', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { path, reason } = req.body;
    
    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Worktree path is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const lockOptions: string[] = ['lock'];
    if (reason) lockOptions.push('--reason', reason);
    lockOptions.push(path);
    
    const result = await git.raw(['worktree', ...lockOptions]);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git lock worktree error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to lock worktree'
    });
  }
});

// POST /api/git/:projectPath/worktree/unlock - Unlock worktree
router.post('/worktree/:projectPath(*)/unlock', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { path } = req.body;
    
    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Worktree path is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const result = await git.raw(['worktree', 'unlock', path]);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git unlock worktree error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unlock worktree'
    });
  }
});

// GET /api/git/:projectPath/tags - Get tags
router.get('/tags/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const git = await getGitInstance(projectPath);
    
    const tags = await git.tags();
    
    res.json({
      success: true,
      data: {
        all: tags.all,
        latest: tags.latest
      }
    });
  } catch (error) {
    console.error('Git tags error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tags'
    });
  }
});

// POST /api/git/:projectPath/tag - Create tag
router.post('/tag/:projectPath(*)', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { name, message, commit } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Tag name is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    
    const tagOptions: string[] = [];
    if (message) {
      tagOptions.push('-a', name, '-m', message);
    } else {
      tagOptions.push(name);
    }
    
    if (commit) tagOptions.push(commit);
    
    const result = await git.addTag(tagOptions);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git create tag error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create tag'
    });
  }
});

// DELETE /api/git/:projectPath/tag/:tagName - Delete tag
router.delete('/tag/:projectPath(*)/:tagName', async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const tagName = req.params.tagName;
    
    const git = await getGitInstance(projectPath);
    
    const result = await git.raw(['tag', '-d', tagName]);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Git delete tag error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete tag'
    });
  }
});

// Enhanced Git Operations with GitOperations service

// POST /api/git/:projectPath/operations/stage - Stage files
router.post('/operations/stage/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { files, all = false, update = false } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!all && (!files || !Array.isArray(files) || files.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Files array is required when not staging all files'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.stageFiles({ files: files || [], all, update });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git stage error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stage files'
    });
  }
});

// POST /api/git/:projectPath/operations/unstage - Unstage files
router.post('/operations/unstage/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { files, all = false } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!all && (!files || !Array.isArray(files) || files.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Files array is required when not unstaging all files'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.unstageFiles({ files: files || [], all });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git unstage error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to unstage files'
    });
  }
});

// POST /api/git/:projectPath/operations/commit - Create commit with enhanced features
router.post('/operations/commit/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { message, author, files, allStaged = true, amend = false, allowEmpty = false } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Commit message is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.commit({
      message: message.trim(),
      author,
      files,
      allStaged,
      amend,
      allowEmpty,
    });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git commit error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create commit'
    });
  }
});

// POST /api/git/:projectPath/operations/push - Push with enhanced features
router.post('/operations/push/:projectPath(*)', authenticate, requirePermission('git', 'dangerous'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { remote, branch, force = false, setUpstream = false, tags = false } = req.body;
    const userId = req.user?.id || 'unknown';
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.push({
      remote,
      branch,
      force,
      setUpstream,
      tags,
    });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git push error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to push to remote'
    });
  }
});

// POST /api/git/:projectPath/operations/pull - Pull with enhanced features
router.post('/operations/pull/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { remote, branch, rebase = false, strategy } = req.body;
    const userId = req.user?.id || 'unknown';
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.pull({
      remote,
      branch,
      rebase,
      strategy,
    });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git pull error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pull from remote'
    });
  }
});

// POST /api/git/:projectPath/operations/branch/create - Create branch with enhanced features
router.post('/operations/branch/create/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { name, startPoint, force = false, track = false, upstream } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Branch name is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.createBranch({
      name: name.trim(),
      startPoint,
      force,
      track,
      upstream,
    });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git create branch error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create branch'
    });
  }
});

// POST /api/git/:projectPath/operations/branch/checkout - Checkout branch
router.post('/operations/branch/checkout/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { branchName } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!branchName || branchName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Branch name is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.checkoutBranch(branchName.trim());
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git checkout error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to checkout branch'
    });
  }
});

// POST /api/git/:projectPath/operations/merge - Merge branch with enhanced features
router.post('/operations/merge/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { branch, strategy, noFf = false, squash = false, message } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!branch || branch.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Branch name is required'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.merge({
      branch: branch.trim(),
      strategy,
      noFf,
      squash,
      message,
    });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git merge error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to merge branch'
    });
  }
});

// POST /api/git/:projectPath/operations/reset - Reset repository state
router.post('/operations/reset/:projectPath(*)', authenticate, requirePermission('git', 'dangerous'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { mode, commit, files } = req.body;
    const userId = req.user?.id || 'unknown';
    
    if (!mode || !['soft', 'mixed', 'hard'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Valid reset mode is required (soft, mixed, hard)'
      });
    }
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.reset({
      mode,
      commit,
      files,
    });
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git reset error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset repository'
    });
  }
});

// POST /api/git/:projectPath/operations/stash - Create stash
router.post('/operations/stash/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { message, includeUntracked = false } = req.body;
    const userId = req.user?.id || 'unknown';
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.stash(message, includeUntracked);
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git stash error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create stash'
    });
  }
});

// POST /api/git/:projectPath/operations/stash/pop - Apply stash
router.post('/operations/stash/pop/:projectPath(*)', authenticate, requirePermission('git', 'write'), async (req, res) => {
  try {
    const projectPath = decodeURIComponent(req.params.projectPath);
    const { index = 0 } = req.body;
    const userId = req.user?.id || 'unknown';
    
    const git = await getGitInstance(projectPath);
    const operations = new GitOperations(git, projectPath, userId);
    
    const result = await operations.stashPop(parseInt(index, 10));
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    console.error('Git stash pop error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply stash'
    });
  }
});

export default router;