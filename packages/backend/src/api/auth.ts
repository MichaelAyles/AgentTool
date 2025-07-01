import { Router } from 'express';
import { authService } from '../auth/auth-service.js';
import { authenticate, authRateLimit } from '../auth/middleware.js';
import { asyncHandler } from '../middleware/error-handler.js';
import { sanitizeInput } from '../middleware/security.js';
import { structuredLogger } from '../middleware/logging.js';
import Joi from 'joi';

const router = Router();

// Validation schemas
const loginSchema = Joi.object({
  provider: Joi.string()
    .valid('local', 'github', 'google', 'microsoft')
    .required(),
  username: Joi.when('provider', {
    is: 'local',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  password: Joi.when('provider', {
    is: 'local',
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  code: Joi.when('provider', {
    is: Joi.string().valid('github', 'google', 'microsoft'),
    then: Joi.string().required(),
    otherwise: Joi.optional(),
  }),
  state: Joi.string().optional(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
});

const setPasswordSchema = Joi.object({
  password: Joi.string().min(8).required(),
});

// Apply rate limiting to auth endpoints
router.use(authRateLimit);

// Login endpoint
router.post(
  '/login',
  sanitizeInput(),
  asyncHandler(async (req, res) => {
    const { provider, username, password, code, state } = req.body;

    const authRequest = {
      provider,
      credentials: provider === 'local' ? { username, password } : undefined,
      code,
      state,
    };

    const result = await authService.authenticate(authRequest);

    if (result.success && result.session) {
      // Set HTTP-only cookie for web clients
      res.cookie('auth_token', result.session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.cookie('refresh_token', result.session.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      structuredLogger.info('User logged in successfully', {
        userId: result.user?.id,
        provider,
        sessionId: result.session.id,
      });
    }

    res.json({
      success: result.success,
      user: result.user
        ? {
            id: result.user.id,
            email: result.user.email,
            username: result.user.username,
            displayName: result.user.displayName,
            avatar: result.user.avatar,
            role: result.user.role,
            settings: result.user.settings,
          }
        : undefined,
      token: result.session?.token,
      expiresAt: result.session?.expiresAt,
      error: result.error,
    });
  })
);

// Refresh token endpoint
router.post(
  '/refresh',
  sanitizeInput(),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    const result = await authService.refreshSession(refreshToken);

    if (result.success && result.session) {
      // Update cookies
      res.cookie('auth_token', result.session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.cookie('refresh_token', result.session.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    res.json({
      success: result.success,
      user: result.user
        ? {
            id: result.user.id,
            email: result.user.email,
            username: result.user.username,
            displayName: result.user.displayName,
            avatar: result.user.avatar,
            role: result.user.role,
            settings: result.user.settings,
          }
        : undefined,
      token: result.session?.token,
      expiresAt: result.session?.expiresAt,
      error: result.error,
    });
  })
);

// Logout endpoint
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    const sessionId = req.user!.sessionId;

    await authService.logout(sessionId);

    // Clear cookies
    res.clearCookie('auth_token');
    res.clearCookie('refresh_token');

    structuredLogger.info('User logged out', {
      userId: req.user!.id,
      sessionId,
    });

    res.json({ success: true });
  })
);

// Get current user
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    // Get full user details from database
    // For now, return basic info from token
    res.json({
      id: userId,
      role: req.user!.role,
      sessionId: req.user!.sessionId,
    });
  })
);

// Change password
router.post(
  '/change-password',
  authenticate,
  sanitizeInput(),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    await authService.changePassword(userId, currentPassword, newPassword);

    structuredLogger.info('User password changed', { userId });

    res.json({ success: true });
  })
);

// Set password (for OAuth users)
router.post(
  '/set-password',
  authenticate,
  sanitizeInput(),
  asyncHandler(async (req, res) => {
    const { password } = req.body;
    const userId = req.user!.id;

    await authService.setPassword(userId, password);

    structuredLogger.info('User password set', { userId });

    res.json({ success: true });
  })
);

// Revoke all sessions
router.post(
  '/revoke-sessions',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    await authService.revokeAllSessions(userId);

    // Clear current cookies
    res.clearCookie('auth_token');
    res.clearCookie('refresh_token');

    structuredLogger.info('All user sessions revoked', { userId });

    res.json({ success: true });
  })
);

// OAuth URLs
router.get(
  '/oauth/github/url',
  asyncHandler(async (req, res) => {
    const state = req.query.state as string;
    const url = authService.getOAuthUrl('github', state);
    res.json({ url });
  })
);

router.get(
  '/oauth/google/url',
  asyncHandler(async (req, res) => {
    const state = req.query.state as string;
    const url = authService.getOAuthUrl('google', state);
    res.json({ url });
  })
);

router.get(
  '/oauth/microsoft/url',
  asyncHandler(async (req, res) => {
    const state = req.query.state as string;
    const url = authService.getOAuthUrl('microsoft', state);
    res.json({ url });
  })
);

// OAuth callbacks (redirect endpoints)
router.get(
  '/oauth/github/callback',
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;

    try {
      const result = await authService.authenticate({
        provider: 'github',
        code: code as string,
        state: state as string,
      });

      if (result.success && result.session) {
        // Set cookies
        res.cookie('auth_token', result.session.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000,
        });

        res.cookie('refresh_token', result.session.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Redirect to frontend
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=success`
        );
      } else {
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=error&message=${encodeURIComponent(result.error || 'Authentication failed')}`
        );
      }
    } catch (error) {
      structuredLogger.error('OAuth callback error', error);
      res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=error&message=${encodeURIComponent('Authentication failed')}`
      );
    }
  })
);

router.get(
  '/oauth/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;

    try {
      const result = await authService.authenticate({
        provider: 'google',
        code: code as string,
        state: state as string,
      });

      if (result.success && result.session) {
        // Set cookies
        res.cookie('auth_token', result.session.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000,
        });

        res.cookie('refresh_token', result.session.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Redirect to frontend
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=success`
        );
      } else {
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=error&message=${encodeURIComponent(result.error || 'Authentication failed')}`
        );
      }
    } catch (error) {
      structuredLogger.error('OAuth callback error', error);
      res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=error&message=${encodeURIComponent('Authentication failed')}`
      );
    }
  })
);

router.get(
  '/oauth/microsoft/callback',
  asyncHandler(async (req, res) => {
    const { code, state } = req.query;

    try {
      const result = await authService.authenticate({
        provider: 'microsoft',
        code: code as string,
        state: state as string,
      });

      if (result.success && result.session) {
        // Set cookies
        res.cookie('auth_token', result.session.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000,
        });

        res.cookie('refresh_token', result.session.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Redirect to frontend
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=success`
        );
      } else {
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=error&message=${encodeURIComponent(result.error || 'Authentication failed')}`
        );
      }
    } catch (error) {
      structuredLogger.error('OAuth callback error', error);
      res.redirect(
        `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=error&message=${encodeURIComponent('Authentication failed')}`
      );
    }
  })
);

export default router;
