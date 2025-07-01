import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { 
  User, 
  Session, 
  AuthRequest, 
  AuthResponse, 
  JWTPayload, 
  RefreshTokenPayload,
  UserRole,
  AuthProvider,
  LocalCredentials,
  AuthConfig
} from './types.js';
import { db } from '../database/index.js';
import { structuredLogger } from '../middleware/logging.js';
import { AppError, AuthenticationError, ValidationError } from '../middleware/error-handler.js';

export class AuthService {
  private config: AuthConfig;

  constructor(config: Partial<AuthConfig> = {}) {
    this.config = {
      jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
      jwtExpiry: process.env.JWT_EXPIRY || '1h',
      refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
      sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24 hours
      enabledProviders: ['local'],
      oauth: {},
      ...config,
    };

    // Add OAuth configs if environment variables are present
    if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
      this.config.oauth.github = {
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackUrl: process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback',
      };
      this.config.enabledProviders.push('github');
    }

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      this.config.oauth.google = {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      };
      this.config.enabledProviders.push('google');
    }

    if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
      this.config.oauth.microsoft = {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackUrl: process.env.MICROSOFT_CALLBACK_URL || '/api/auth/microsoft/callback',
      };
      this.config.enabledProviders.push('microsoft');
    }
  }

  async authenticate(request: AuthRequest): Promise<AuthResponse> {
    try {
      switch (request.provider) {
        case 'local':
          return await this.authenticateLocal(request.credentials!);
        case 'github':
          return await this.authenticateOAuth('github', request.code!, request.state);
        case 'google':
          return await this.authenticateOAuth('google', request.code!, request.state);
        case 'microsoft':
          return await this.authenticateOAuth('microsoft', request.code!, request.state);
        default:
          throw new ValidationError(`Unsupported authentication provider: ${request.provider}`);
      }
    } catch (error) {
      structuredLogger.error('Authentication failed', error, { provider: request.provider });
      
      if (error instanceof AuthenticationError || error instanceof ValidationError) {
        throw error;
      }
      
      throw new AuthenticationError('Authentication failed');
    }
  }

  private async authenticateLocal(credentials: LocalCredentials): Promise<AuthResponse> {
    const { username, password } = credentials;

    // Find user by username or email
    const user = await db.getUserByUsername(username) || await db.getUserByEmail(username);
    
    if (!user) {
      throw new AuthenticationError('Invalid username or password');
    }

    // Verify password
    const passwordHash = await db.getUserPasswordHash(user.id);
    if (!passwordHash) {
      throw new AuthenticationError('Invalid username or password');
    }

    const isValidPassword = await bcrypt.compare(password, passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid username or password');
    }

    // Check if user is active
    if (!user.active) {
      throw new AuthenticationError('Account is disabled');
    }

    // Create session
    const session = await this.createSession(user);

    // Update last login
    await db.updateUserLastLogin(user.id);

    structuredLogger.info('User authenticated successfully', {
      userId: user.id,
      provider: 'local',
      sessionId: session.id,
    });

    return {
      success: true,
      user,
      session,
    };
  }

  private async authenticateOAuth(
    provider: 'github' | 'google' | 'microsoft',
    code: string,
    state?: string
  ): Promise<AuthResponse> {
    // Exchange code for access token
    const tokenResponse = await this.exchangeCodeForToken(provider, code);
    
    if (!tokenResponse.access_token) {
      throw new AuthenticationError('Failed to obtain access token');
    }

    // Get user info from provider
    const providerUserInfo = await this.getProviderUserInfo(provider, tokenResponse.access_token);

    // Find or create user
    let user = await db.getUserByProviderId(provider, providerUserInfo.id);
    
    if (!user) {
      // Check if user exists with same email
      user = await db.getUserByEmail(providerUserInfo.email);
      
      if (user) {
        // Link provider to existing user
        await db.linkAuthProvider(user.id, {
          provider,
          providerId: providerUserInfo.id,
          email: providerUserInfo.email,
          connected: new Date(),
        });
      } else {
        // Create new user
        user = await this.createUserFromProvider(provider, providerUserInfo);
      }
    }

    // Check if user is active
    if (!user.active) {
      throw new AuthenticationError('Account is disabled');
    }

    // Create session
    const session = await this.createSession(user);

    // Update last login
    await db.updateUserLastLogin(user.id);

    structuredLogger.info('User authenticated via OAuth', {
      userId: user.id,
      provider,
      sessionId: session.id,
    });

    return {
      success: true,
      user,
      session,
    };
  }

  private async exchangeCodeForToken(
    provider: 'github' | 'google' | 'microsoft',
    code: string
  ): Promise<any> {
    const config = this.config.oauth[provider];
    if (!config) {
      throw new ValidationError(`OAuth not configured for ${provider}`);
    }

    const tokenUrl = this.getTokenUrl(provider);
    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
    });

    if (provider === 'github') {
      params.append('accept', 'application/json');
    } else {
      params.append('grant_type', 'authorization_code');
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new AuthenticationError(`Failed to exchange code for token: ${response.statusText}`);
    }

    return await response.json();
  }

  private async getProviderUserInfo(provider: string, accessToken: string): Promise<any> {
    const userInfoUrl = this.getUserInfoUrl(provider);
    
    const response = await fetch(userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new AuthenticationError(`Failed to get user info: ${response.statusText}`);
    }

    const data = await response.json();

    // Normalize user info across providers
    switch (provider) {
      case 'github':
        return {
          id: data.id.toString(),
          email: data.email,
          username: data.login,
          displayName: data.name,
          avatar: data.avatar_url,
        };
      case 'google':
        return {
          id: data.sub,
          email: data.email,
          username: data.email.split('@')[0],
          displayName: data.name,
          avatar: data.picture,
        };
      case 'microsoft':
        return {
          id: data.id,
          email: data.mail || data.userPrincipalName,
          username: (data.mail || data.userPrincipalName).split('@')[0],
          displayName: data.displayName,
          avatar: undefined, // Microsoft requires additional API call for photo
        };
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private getTokenUrl(provider: string): string {
    switch (provider) {
      case 'github':
        return 'https://github.com/login/oauth/access_token';
      case 'google':
        return 'https://oauth2.googleapis.com/token';
      case 'microsoft':
        return 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private getUserInfoUrl(provider: string): string {
    switch (provider) {
      case 'github':
        return 'https://api.github.com/user';
      case 'google':
        return 'https://www.googleapis.com/oauth2/v2/userinfo';
      case 'microsoft':
        return 'https://graph.microsoft.com/v1.0/me';
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async createUserFromProvider(
    provider: string,
    providerInfo: any
  ): Promise<User> {
    const user: User = {
      id: uuidv4(),
      email: providerInfo.email,
      username: providerInfo.username,
      displayName: providerInfo.displayName,
      avatar: providerInfo.avatar,
      role: UserRole.USER,
      providers: [{
        provider: provider as any,
        providerId: providerInfo.id,
        email: providerInfo.email,
        connected: new Date(),
      }],
      settings: {},
      created: new Date(),
      active: true,
    };

    await db.createUser(user);
    
    structuredLogger.info('Created new user from OAuth provider', {
      userId: user.id,
      provider,
      email: user.email,
    });

    return user;
  }

  private async createSession(user: User): Promise<Session> {
    const sessionId = uuidv4();
    const now = new Date();
    
    // Create JWT token
    const jwtPayload: JWTPayload = {
      userId: user.id,
      sessionId,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + this.parseExpiry(this.config.jwtExpiry),
      iat: Math.floor(Date.now() / 1000),
    };

    const token = jwt.sign(jwtPayload, this.config.jwtSecret);

    // Create refresh token
    const refreshPayload: RefreshTokenPayload = {
      userId: user.id,
      sessionId,
      exp: Math.floor(Date.now() / 1000) + this.parseExpiry(this.config.refreshTokenExpiry),
      iat: Math.floor(Date.now() / 1000),
    };

    const refreshToken = jwt.sign(refreshPayload, this.config.jwtSecret);

    const session: Session = {
      id: sessionId,
      userId: user.id,
      token,
      refreshToken,
      expiresAt: new Date(now.getTime() + this.config.sessionMaxAge),
      createdAt: now,
      lastActivity: now,
    };

    await db.createSession(session);

    return session;
  }

  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as JWTPayload;
      
      // Check if session exists and is valid
      const session = await db.getSession(payload.sessionId);
      if (!session || session.expiresAt < new Date()) {
        throw new AuthenticationError('Session expired');
      }

      // Update last activity
      await db.updateSessionActivity(payload.sessionId);

      return payload;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  }

  async refreshSession(refreshToken: string): Promise<AuthResponse> {
    try {
      const payload = jwt.verify(refreshToken, this.config.jwtSecret) as RefreshTokenPayload;
      
      // Get session and user
      const session = await db.getSession(payload.sessionId);
      if (!session || session.userId !== payload.userId) {
        throw new AuthenticationError('Invalid refresh token');
      }

      const user = await db.getUserById(payload.userId);
      if (!user || !user.active) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Revoke old session
      await db.revokeSession(payload.sessionId);

      // Create new session
      const newSession = await this.createSession(user);

      structuredLogger.info('Session refreshed', {
        userId: user.id,
        oldSessionId: payload.sessionId,
        newSessionId: newSession.id,
      });

      return {
        success: true,
        user,
        session: newSession,
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid refresh token');
      }
      throw error;
    }
  }

  async logout(sessionId: string): Promise<void> {
    await db.revokeSession(sessionId);
    structuredLogger.info('User logged out', { sessionId });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await db.revokeAllUserSessions(userId);
    structuredLogger.info('All user sessions revoked', { userId });
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Verify old password
    const passwordHash = await db.getUserPasswordHash(userId);
    if (!passwordHash) {
      throw new ValidationError('User has no password set');
    }

    const isValidPassword = await bcrypt.compare(oldPassword, passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid current password');
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password
    await db.updateUserPassword(userId, newPasswordHash);

    // Revoke all sessions except current
    await db.revokeAllUserSessions(userId);

    structuredLogger.info('User password changed', { userId });
  }

  async setPassword(userId: string, password: string): Promise<void> {
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Update password
    await db.updateUserPassword(userId, passwordHash);

    structuredLogger.info('User password set', { userId });
  }

  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 60 * 60 * 24;
      default: return 3600; // Default 1 hour
    }
  }

  getOAuthUrl(provider: 'github' | 'google' | 'microsoft', state?: string): string {
    const config = this.config.oauth[provider];
    if (!config) {
      throw new ValidationError(`OAuth not configured for ${provider}`);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callbackUrl,
    });

    if (state) {
      params.append('state', state);
    }

    switch (provider) {
      case 'github':
        params.append('scope', 'user:email');
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
      
      case 'google':
        params.append('response_type', 'code');
        params.append('scope', 'openid email profile');
        params.append('access_type', 'offline');
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      
      case 'microsoft':
        params.append('response_type', 'code');
        params.append('scope', 'openid email profile User.Read');
        params.append('response_mode', 'query');
        return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
      
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

// Singleton instance
export const authService = new AuthService();