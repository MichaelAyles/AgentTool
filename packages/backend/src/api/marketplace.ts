import { Router } from 'express';
import { authenticate } from '../auth/middleware.js';
import { requirePermission } from '../auth/permissions.js';
import {
  comprehensiveAuditLogger,
  AuditCategory,
} from '../security/audit-logger.js';
import { SecurityLevel } from '../security/types.js';
import {
  adapterMarketplace,
  MarketplaceSearch,
} from '../services/adapter-marketplace.js';

const router = Router();

// Input sanitization function
const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Search adapters in the marketplace
 */
router.get(
  '/search',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const {
        query,
        category,
        tags,
        author,
        verified,
        platform,
        sortBy,
        sortOrder,
        limit,
        offset,
      } = req.query;

      const search: MarketplaceSearch = {
        query: query ? sanitizeInput(query as string) : undefined,
        category: category ? sanitizeInput(category as string) : undefined,
        tags: tags
          ? Array.isArray(tags)
            ? tags.map(t => sanitizeInput(t as string))
            : [sanitizeInput(tags as string)]
          : undefined,
        author: author ? sanitizeInput(author as string) : undefined,
        verified: verified !== undefined ? verified === 'true' : undefined,
        platform: platform ? sanitizeInput(platform as string) : undefined,
        sortBy: sortBy as any,
        sortOrder: sortOrder as any,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      };

      const results = await adapterMarketplace.searchAdapters(search);

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      console.error('Error searching marketplace:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search marketplace',
      });
    }
  }
);

/**
 * Get adapter details by ID
 */
router.get(
  '/adapters/:adapterId',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const adapterId = sanitizeInput(req.params.adapterId);
      const adapter = await adapterMarketplace.getAdapter(adapterId);

      if (!adapter) {
        return res.status(404).json({
          success: false,
          error: 'Adapter not found',
        });
      }

      res.json({
        success: true,
        data: adapter,
      });
    } catch (error) {
      console.error('Error getting adapter:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get adapter details',
      });
    }
  }
);

/**
 * Install an adapter from the marketplace
 */
router.post(
  '/adapters/:adapterId/install',
  authenticate,
  requirePermission('marketplace', 'install'),
  async (req, res) => {
    try {
      const adapterId = sanitizeInput(req.params.adapterId);
      const {
        version,
        autoUpdate = false,
        enableAfterInstall = true,
        configureAfterInstall = false,
      } = req.body;
      const userId = req.user?.id || 'unknown';

      const installation = await adapterMarketplace.installAdapter(
        adapterId,
        version ? sanitizeInput(version) : undefined,
        userId,
        {
          autoUpdate,
          enableAfterInstall,
          configureAfterInstall,
        }
      );

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'marketplace_adapter_install_requested',
        resourceType: 'marketplace_adapter',
        resourceId: adapterId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.DANGEROUS,
        details: {
          adapterId,
          version: version || 'latest',
          autoUpdate,
          enableAfterInstall,
        },
      });

      res.status(201).json({
        success: true,
        data: installation,
      });
    } catch (error) {
      console.error('Error installing adapter:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to install adapter',
      });
    }
  }
);

/**
 * Uninstall an adapter
 */
router.delete(
  '/adapters/:adapterId/install',
  authenticate,
  requirePermission('marketplace', 'uninstall'),
  async (req, res) => {
    try {
      const adapterId = sanitizeInput(req.params.adapterId);
      const userId = req.user?.id || 'unknown';

      await adapterMarketplace.uninstallAdapter(adapterId, userId);

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.DANGEROUS_OPERATIONS,
        action: 'marketplace_adapter_uninstall_requested',
        resourceType: 'marketplace_adapter',
        resourceId: adapterId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.MODERATE,
        details: {
          adapterId,
        },
      });

      res.json({
        success: true,
        message: 'Adapter uninstalled successfully',
      });
    } catch (error) {
      console.error('Error uninstalling adapter:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to uninstall adapter',
      });
    }
  }
);

/**
 * Get installed adapters
 */
router.get(
  '/installed',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const installations = adapterMarketplace.getInstalledAdapters();

      res.json({
        success: true,
        data: installations,
      });
    } catch (error) {
      console.error('Error getting installed adapters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get installed adapters',
      });
    }
  }
);

/**
 * Get marketplace statistics
 */
router.get(
  '/stats',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const stats = await adapterMarketplace.getMarketplaceStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error getting marketplace stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get marketplace statistics',
      });
    }
  }
);

/**
 * Submit new adapter to marketplace
 */
router.post(
  '/submit',
  authenticate,
  requirePermission('marketplace', 'submit'),
  async (req, res) => {
    try {
      const userId = req.user?.id || 'unknown';
      const adapterData = req.body;

      // Sanitize string fields
      if (adapterData.name) adapterData.name = sanitizeInput(adapterData.name);
      if (adapterData.displayName)
        adapterData.displayName = sanitizeInput(adapterData.displayName);
      if (adapterData.description)
        adapterData.description = sanitizeInput(adapterData.description);
      if (adapterData.version)
        adapterData.version = sanitizeInput(adapterData.version);
      if (adapterData.license)
        adapterData.license = sanitizeInput(adapterData.license);
      if (adapterData.category)
        adapterData.category = sanitizeInput(adapterData.category);

      // Sanitize author information
      if (adapterData.author) {
        if (adapterData.author.name)
          adapterData.author.name = sanitizeInput(adapterData.author.name);
        if (adapterData.author.email)
          adapterData.author.email = sanitizeInput(adapterData.author.email);
        if (adapterData.author.github)
          adapterData.author.github = sanitizeInput(adapterData.author.github);
        if (adapterData.author.website)
          adapterData.author.website = sanitizeInput(
            adapterData.author.website
          );
      }

      // Sanitize repository information
      if (adapterData.repository) {
        if (adapterData.repository.url)
          adapterData.repository.url = sanitizeInput(
            adapterData.repository.url
          );
        if (adapterData.repository.branch)
          adapterData.repository.branch = sanitizeInput(
            adapterData.repository.branch
          );
        if (adapterData.repository.directory)
          adapterData.repository.directory = sanitizeInput(
            adapterData.repository.directory
          );
      }

      // Sanitize arrays
      if (adapterData.tags) {
        adapterData.tags = Array.isArray(adapterData.tags)
          ? adapterData.tags.map((tag: string) => sanitizeInput(tag))
          : [];
      }
      if (adapterData.keywords) {
        adapterData.keywords = Array.isArray(adapterData.keywords)
          ? adapterData.keywords.map((keyword: string) =>
              sanitizeInput(keyword)
            )
          : [];
      }

      const adapterId = await adapterMarketplace.submitAdapter(
        adapterData,
        userId
      );

      await comprehensiveAuditLogger.logAuditEvent({
        category: AuditCategory.SYSTEM_CHANGES,
        action: 'marketplace_adapter_submitted',
        resourceType: 'marketplace_adapter',
        resourceId: adapterId,
        userId,
        sessionId: req.session?.id || req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        outcome: 'success',
        severity: SecurityLevel.SAFE,
        details: {
          adapterName: adapterData.name,
          category: adapterData.category,
          author: adapterData.author?.name,
        },
      });

      res.status(201).json({
        success: true,
        data: { id: adapterId },
        message: 'Adapter submitted for review',
      });
    } catch (error) {
      console.error('Error submitting adapter:', error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to submit adapter',
      });
    }
  }
);

/**
 * Get adapter categories
 */
router.get(
  '/categories',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const categories = [
        {
          id: 'ai-assistant',
          name: 'AI Assistants',
          description: 'AI-powered coding assistants and chatbots',
        },
        {
          id: 'cli-tool',
          name: 'CLI Tools',
          description: 'Command-line interfaces and utilities',
        },
        {
          id: 'development',
          name: 'Development',
          description: 'Development tools and frameworks',
        },
        {
          id: 'automation',
          name: 'Automation',
          description: 'Automation scripts and workflows',
        },
        {
          id: 'utility',
          name: 'Utilities',
          description: 'General-purpose utilities and helpers',
        },
        { id: 'other', name: 'Other', description: 'Other types of adapters' },
      ];

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error('Error getting categories:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get categories',
      });
    }
  }
);

/**
 * Get featured adapters
 */
router.get(
  '/featured',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const search: MarketplaceSearch = {
        limit: 10,
        sortBy: 'downloads',
        sortOrder: 'desc',
      };

      const results = await adapterMarketplace.searchAdapters(search);
      const featuredAdapters = results.adapters.filter(
        adapter => adapter.metadata.featured
      );

      res.json({
        success: true,
        data: featuredAdapters,
      });
    } catch (error) {
      console.error('Error getting featured adapters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get featured adapters',
      });
    }
  }
);

/**
 * Get adapter installation status
 */
router.get(
  '/adapters/:adapterId/installation',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const adapterId = sanitizeInput(req.params.adapterId);
      const installations = adapterMarketplace.getInstalledAdapters();
      const installation = installations.find(
        inst => inst.adapterId === adapterId
      );

      if (!installation) {
        return res.status(404).json({
          success: false,
          error: 'Adapter not installed',
        });
      }

      res.json({
        success: true,
        data: installation,
      });
    } catch (error) {
      console.error('Error getting installation status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get installation status',
      });
    }
  }
);

/**
 * Get popular adapters
 */
router.get(
  '/popular',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 20;

      const search: MarketplaceSearch = {
        limit: Math.min(limit, 50),
        sortBy: 'downloads',
        sortOrder: 'desc',
      };

      const results = await adapterMarketplace.searchAdapters(search);

      res.json({
        success: true,
        data: results.adapters,
      });
    } catch (error) {
      console.error('Error getting popular adapters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get popular adapters',
      });
    }
  }
);

/**
 * Get recent adapters
 */
router.get(
  '/recent',
  authenticate,
  requirePermission('marketplace', 'read'),
  async (req, res) => {
    try {
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 20;

      const search: MarketplaceSearch = {
        limit: Math.min(limit, 50),
        sortBy: 'created',
        sortOrder: 'desc',
      };

      const results = await adapterMarketplace.searchAdapters(search);

      res.json({
        success: true,
        data: results.adapters,
      });
    } catch (error) {
      console.error('Error getting recent adapters:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recent adapters',
      });
    }
  }
);

export default router;
