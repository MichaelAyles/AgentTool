import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Simple input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

// Script storage interface
interface StoredScript {
  id: string;
  name: string;
  description: string;
  scriptType: string;
  content: string;
  author: string;
  created: Date;
  modified: Date;
  tags: string[];
  isPublic: boolean;
  executionCount: number;
  lastExecuted?: Date;
}

// In-memory storage (in production, use a database)
const scripts: Map<string, StoredScript> = new Map();
const userScripts: Map<string, Set<string>> = new Map();

/**
 * Get available script types from custom script adapter
 */
router.get(
  '/types',
  authenticate,
  requirePermission('script', 'read'),
  async (req, res) => {
    try {
      // This would normally get the types from the adapter registry
      const scriptTypes = [
        {
          type: 'bash',
          interpreter: 'bash',
          extension: '.sh',
          description: 'Bash shell scripts',
        },
        {
          type: 'zsh',
          interpreter: 'zsh',
          extension: '.zsh',
          description: 'Z shell scripts',
        },
        {
          type: 'sh',
          interpreter: 'sh',
          extension: '.sh',
          description: 'POSIX shell scripts',
        },
        {
          type: 'python',
          interpreter: 'python3',
          extension: '.py',
          description: 'Python 3 scripts',
        },
        {
          type: 'node',
          interpreter: 'node',
          extension: '.js',
          description: 'Node.js JavaScript',
        },
        {
          type: 'deno',
          interpreter: 'deno',
          extension: '.ts',
          description: 'Deno TypeScript/JavaScript',
        },
        {
          type: 'bun',
          interpreter: 'bun',
          extension: '.ts',
          description: 'Bun TypeScript/JavaScript',
        },
        {
          type: 'ruby',
          interpreter: 'ruby',
          extension: '.rb',
          description: 'Ruby scripts',
        },
        {
          type: 'php',
          interpreter: 'php',
          extension: '.php',
          description: 'PHP scripts',
        },
        {
          type: 'go',
          interpreter: 'go',
          extension: '.go',
          description: 'Go programs',
        },
        {
          type: 'rust',
          interpreter: 'rustc',
          extension: '.rs',
          description: 'Rust programs',
        },
        {
          type: 'jq',
          interpreter: 'jq',
          extension: '.jq',
          description: 'JSON query processor',
        },
        {
          type: 'awk',
          interpreter: 'awk',
          extension: '.awk',
          description: 'AWK text processing',
        },
        {
          type: 'sed',
          interpreter: 'sed',
          extension: '.sed',
          description: 'Stream editor',
        },
        {
          type: 'custom',
          interpreter: '',
          extension: '.txt',
          description: 'Custom interpreter',
        },
      ];

      res.json({
        success: true,
        data: scriptTypes,
      });
    } catch (error) {
      console.error('Error getting script types:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get script types',
      });
    }
  }
);

/**
 * Execute a script directly
 */
router.post(
  '/execute',
  authenticate,
  requirePermission('script', 'execute'),
  async (req, res) => {
    try {
      const {
        script,
        scriptType = 'bash',
        workingDirectory,
        environment,
        timeout,
        stdin,
        args,
        customConfig,
        saveAs,
      } = req.body;
      const userId = req.user?.id || 'unknown';

      if (!script || script.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Script content is required',
        });
      }

      // Log script execution attempt
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'custom_script_executed',
        resourceType: 'script',
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'initiated',
        severity: SecurityLevel.DANGEROUS,
        details: {
          scriptType,
          scriptLength: script.length,
          workingDirectory,
          hasCustomConfig: !!customConfig,
          saveAs: !!saveAs,
        },
      });

      // For now, simulate script execution (replace with actual CustomScriptAdapter integration)
      const mockResult = {
        success: true,
        exitCode: 0,
        stdout: `Mock execution result for ${scriptType} script\nScript length: ${script.length} characters\n`,
        stderr: '',
        executionTime: 123,
        scriptPath: saveAs ? `/tmp/scripts/${saveAs}` : undefined,
      };

      // Save script if requested
      if (saveAs && saveAs.trim().length > 0) {
        const scriptId = uuidv4();
        const storedScript: StoredScript = {
          id: scriptId,
          name: sanitizeInput(saveAs),
          description: req.body.description || '',
          scriptType: sanitizeInput(scriptType),
          content: script,
          author: userId,
          created: new Date(),
          modified: new Date(),
          tags: req.body.tags || [],
          isPublic: req.body.isPublic || false,
          executionCount: 1,
          lastExecuted: new Date(),
        };

        scripts.set(scriptId, storedScript);

        if (!userScripts.has(userId)) {
          userScripts.set(userId, new Set());
        }
        userScripts.get(userId)!.add(scriptId);
      }

      res.json({
        success: true,
        data: mockResult,
      });
    } catch (error) {
      console.error('Error executing script:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute script',
      });
    }
  }
);

/**
 * Get user's saved scripts
 */
router.get(
  '/saved',
  authenticate,
  requirePermission('script', 'read'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const { tags, scriptType, isPublic } = req.query;

      let userScriptIds = userScripts.get(userId) || new Set();
      let filteredScripts = Array.from(userScriptIds)
        .map(id => scripts.get(id))
        .filter(script => script !== undefined) as StoredScript[];

      // Apply filters
      if (tags && typeof tags === 'string') {
        const tagList = tags.split(',').map(t => t.trim());
        filteredScripts = filteredScripts.filter(script =>
          script.tags.some(tag => tagList.includes(tag))
        );
      }

      if (scriptType && typeof scriptType === 'string') {
        filteredScripts = filteredScripts.filter(
          script => script.scriptType === scriptType
        );
      }

      if (isPublic !== undefined) {
        const publicFilter = isPublic === 'true';
        filteredScripts = filteredScripts.filter(
          script => script.isPublic === publicFilter
        );
      }

      // Sort by modified date (newest first)
      filteredScripts.sort(
        (a, b) => b.modified.getTime() - a.modified.getTime()
      );

      res.json({
        success: true,
        data: filteredScripts.map(script => ({
          ...script,
          content: undefined, // Don't include content in list
        })),
        count: filteredScripts.length,
      });
    } catch (error) {
      console.error('Error getting saved scripts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get saved scripts',
      });
    }
  }
);

/**
 * Get a specific script
 */
router.get(
  '/saved/:scriptId',
  authenticate,
  requirePermission('script', 'read'),
  async (req, res) => {
    try {
      const { scriptId } = req.params;
      const userId = req.user?.id || 'unknown';
      const sanitizedScriptId = sanitizeInput(scriptId);

      const script = scripts.get(sanitizedScriptId);
      if (!script) {
        return res.status(404).json({
          success: false,
          error: 'Script not found',
        });
      }

      // Check permissions
      const userScriptIds = userScripts.get(userId) || new Set();
      if (!script.isPublic && !userScriptIds.has(sanitizedScriptId)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      res.json({
        success: true,
        data: script,
      });
    } catch (error) {
      console.error('Error getting script:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get script',
      });
    }
  }
);

/**
 * Save a new script
 */
router.post(
  '/saved',
  authenticate,
  requirePermission('script', 'create'),
  async (req, res) => {
    try {
      const {
        name,
        description = '',
        scriptType,
        content,
        tags = [],
        isPublic = false,
      } = req.body;
      const userId = req.user?.id || 'unknown';

      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Script name is required',
        });
      }

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Script content is required',
        });
      }

      if (!scriptType || scriptType.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Script type is required',
        });
      }

      const scriptId = uuidv4();
      const storedScript: StoredScript = {
        id: scriptId,
        name: sanitizeInput(name),
        description: sanitizeInput(description),
        scriptType: sanitizeInput(scriptType),
        content,
        author: userId,
        created: new Date(),
        modified: new Date(),
        tags: Array.isArray(tags) ? tags.map(tag => sanitizeInput(tag)) : [],
        isPublic,
        executionCount: 0,
      };

      scripts.set(scriptId, storedScript);

      if (!userScripts.has(userId)) {
        userScripts.set(userId, new Set());
      }
      userScripts.get(userId)!.add(scriptId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'script_saved',
        resourceType: 'script',
        resourceId: scriptId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          scriptName: name,
          scriptType,
          contentLength: content.length,
          isPublic,
          tags,
        },
      });

      res.status(201).json({
        success: true,
        data: storedScript,
      });
    } catch (error) {
      console.error('Error saving script:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to save script',
      });
    }
  }
);

/**
 * Update a script
 */
router.put(
  '/saved/:scriptId',
  authenticate,
  requirePermission('script', 'write'),
  async (req, res) => {
    try {
      const { scriptId } = req.params;
      const { name, description, scriptType, content, tags, isPublic } =
        req.body;
      const userId = req.user?.id || 'unknown';
      const sanitizedScriptId = sanitizeInput(scriptId);

      const script = scripts.get(sanitizedScriptId);
      if (!script) {
        return res.status(404).json({
          success: false,
          error: 'Script not found',
        });
      }

      // Check permissions - only author can modify
      if (script.author !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - you can only modify your own scripts',
        });
      }

      // Update script
      const updatedScript: StoredScript = {
        ...script,
        name: name !== undefined ? sanitizeInput(name) : script.name,
        description:
          description !== undefined
            ? sanitizeInput(description)
            : script.description,
        scriptType:
          scriptType !== undefined
            ? sanitizeInput(scriptType)
            : script.scriptType,
        content: content !== undefined ? content : script.content,
        tags:
          tags !== undefined
            ? Array.isArray(tags)
              ? tags.map(tag => sanitizeInput(tag))
              : script.tags
            : script.tags,
        isPublic: isPublic !== undefined ? isPublic : script.isPublic,
        modified: new Date(),
      };

      scripts.set(sanitizedScriptId, updatedScript);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'script_updated',
        resourceType: 'script',
        resourceId: scriptId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          scriptName: updatedScript.name,
          scriptType: updatedScript.scriptType,
          changes: Object.keys(req.body),
        },
      });

      res.json({
        success: true,
        data: updatedScript,
      });
    } catch (error) {
      console.error('Error updating script:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update script',
      });
    }
  }
);

/**
 * Delete a script
 */
router.delete(
  '/saved/:scriptId',
  authenticate,
  requirePermission('script', 'delete'),
  async (req, res) => {
    try {
      const { scriptId } = req.params;
      const userId = req.user?.id || 'unknown';
      const sanitizedScriptId = sanitizeInput(scriptId);

      const script = scripts.get(sanitizedScriptId);
      if (!script) {
        return res.status(404).json({
          success: false,
          error: 'Script not found',
        });
      }

      // Check permissions - only author can delete
      if (script.author !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied - you can only delete your own scripts',
        });
      }

      // Remove script
      scripts.delete(sanitizedScriptId);
      const userScriptIds = userScripts.get(userId);
      if (userScriptIds) {
        userScriptIds.delete(sanitizedScriptId);
      }

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'script_deleted',
        resourceType: 'script',
        resourceId: scriptId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          scriptName: script.name,
          scriptType: script.scriptType,
        },
      });

      res.json({
        success: true,
        message: 'Script deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting script:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete script',
      });
    }
  }
);

/**
 * Execute a saved script
 */
router.post(
  '/saved/:scriptId/execute',
  authenticate,
  requirePermission('script', 'execute'),
  async (req, res) => {
    try {
      const { scriptId } = req.params;
      const {
        workingDirectory,
        environment,
        timeout,
        stdin,
        args,
        customConfig,
      } = req.body;
      const userId = req.user?.id || 'unknown';
      const sanitizedScriptId = sanitizeInput(scriptId);

      const script = scripts.get(sanitizedScriptId);
      if (!script) {
        return res.status(404).json({
          success: false,
          error: 'Script not found',
        });
      }

      // Check permissions
      const userScriptIds = userScripts.get(userId) || new Set();
      if (!script.isPublic && !userScriptIds.has(sanitizedScriptId)) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }

      // Update execution count and last executed time
      script.executionCount++;
      script.lastExecuted = new Date();
      scripts.set(sanitizedScriptId, script);

      // Log script execution
      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'saved_script_executed',
        resourceType: 'script',
        resourceId: scriptId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'initiated',
        severity: SecurityLevel.DANGEROUS,
        details: {
          scriptName: script.name,
          scriptType: script.scriptType,
          executionCount: script.executionCount,
          workingDirectory,
        },
      });

      // Execute the script (mock result for now)
      const mockResult = {
        success: true,
        exitCode: 0,
        stdout: `Executing saved script: ${script.name}\nType: ${script.scriptType}\nExecution #${script.executionCount}\n`,
        stderr: '',
        executionTime: 456,
      };

      res.json({
        success: true,
        data: mockResult,
      });
    } catch (error) {
      console.error('Error executing saved script:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute saved script',
      });
    }
  }
);

/**
 * Get public scripts (community scripts)
 */
router.get(
  '/public',
  authenticate,
  requirePermission('script', 'read'),
  async (req, res) => {
    try {
      const { tags, scriptType, author } = req.query;

      let publicScripts = Array.from(scripts.values()).filter(
        script => script.isPublic
      );

      // Apply filters
      if (tags && typeof tags === 'string') {
        const tagList = tags.split(',').map(t => t.trim());
        publicScripts = publicScripts.filter(script =>
          script.tags.some(tag => tagList.includes(tag))
        );
      }

      if (scriptType && typeof scriptType === 'string') {
        publicScripts = publicScripts.filter(
          script => script.scriptType === scriptType
        );
      }

      if (author && typeof author === 'string') {
        publicScripts = publicScripts.filter(
          script => script.author === author
        );
      }

      // Sort by execution count (most popular first)
      publicScripts.sort((a, b) => b.executionCount - a.executionCount);

      res.json({
        success: true,
        data: publicScripts.map(script => ({
          ...script,
          content: undefined, // Don't include content in list
        })),
        count: publicScripts.length,
      });
    } catch (error) {
      console.error('Error getting public scripts:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get public scripts',
      });
    }
  }
);

export default router;
