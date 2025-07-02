import { Request, Response, Router } from 'express';
import { 
  connectionPairingService, 
  PairingRegistration,
} from '../services/connection-pairing-service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/connection/register
 * Register a local agent connection with tunnel URL
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const registration: PairingRegistration = req.body;
    
    // Validate required fields
    if (!registration.sessionId || !registration.tunnelUrl) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId and tunnelUrl',
        code: 'MISSING_FIELDS',
      });
    }

    // Validate sessionId format (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(registration.sessionId)) {
      return res.status(400).json({
        error: 'Invalid sessionId format. Must be a valid UUID.',
        code: 'INVALID_SESSION_ID',
      });
    }

    // Extract client info from request
    const clientInfo = {
      platform: req.headers['x-client-platform'] as string || 'unknown',
      version: req.headers['x-client-version'] as string || '1.0.0',
      userAgent: req.headers['user-agent'],
      ...registration.clientInfo,
    };

    await connectionPairingService.registerConnection({
      ...registration,
      clientInfo,
    });

    logger.info('Agent connection registered successfully', {
      sessionId: registration.sessionId,
      tunnelUrl: registration.tunnelUrl,
      clientInfo,
    });

    res.status(200).json({
      message: 'Connection registered successfully',
      sessionId: registration.sessionId,
      timestamp: Date.now(),
    });

  } catch (error) {
    logger.error('Error registering connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      body: req.body,
    });

    if (error instanceof Error && error.message.includes('Invalid tunnel URL')) {
      return res.status(400).json({
        error: error.message,
        code: 'INVALID_TUNNEL_URL',
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/v1/connection/status?sessionId=<uuid>
 * Check the status of a pairing session
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).json({
        error: 'sessionId query parameter is required',
        code: 'MISSING_SESSION_ID',
      });
    }

    const status = await connectionPairingService.getConnectionStatus(sessionId);

    // Add helpful information for pending status
    if (status.status === 'pending') {
      res.status(200).json({
        ...status,
        message: 'Waiting for local agent to connect',
        instructions: 'Run the installation command in your terminal',
      });
    } else {
      res.status(200).json(status);
    }

  } catch (error) {
    logger.error('Error checking connection status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: req.query.sessionId,
    });

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * DELETE /api/v1/connection/:sessionId
 * Remove a pairing session
 */
router.delete('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        error: 'sessionId is required',
        code: 'MISSING_SESSION_ID',
      });
    }

    const removed = await connectionPairingService.removeSession(sessionId);

    if (removed) {
      res.status(200).json({
        message: 'Session removed successfully',
        sessionId,
      });
    } else {
      res.status(404).json({
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
        sessionId,
      });
    }

  } catch (error) {
    logger.error('Error removing session', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: req.params.sessionId,
    });

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/v1/connection/sessions
 * Get all active sessions (for debugging/monitoring)
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await connectionPairingService.getActiveSessions();
    const stats = await connectionPairingService.getSessionStats();

    res.status(200).json({
      sessions,
      stats,
      timestamp: Date.now(),
    });

  } catch (error) {
    logger.error('Error getting active sessions', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
});

/**
 * GET /api/v1/connection/health
 * Health check endpoint for the pairing service
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const stats = await connectionPairingService.getSessionStats();
    
    res.status(200).json({
      status: 'healthy',
      service: 'connection-pairing',
      timestamp: Date.now(),
      stats,
    });

  } catch (error) {
    logger.error('Connection pairing health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      status: 'unhealthy',
      service: 'connection-pairing',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
});

export default router;