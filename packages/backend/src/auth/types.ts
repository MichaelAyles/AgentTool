export interface User {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatar?: string;
  role: UserRole;
  providers: AuthProvider[];
  settings: UserSettings;
  created: Date;
  lastLogin?: Date;
  active: boolean;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer',
}

export interface AuthProvider {
  provider: 'local' | 'github' | 'google' | 'microsoft';
  providerId: string;
  email?: string;
  connected: Date;
}

export interface UserSettings {
  theme?: 'light' | 'dark' | 'system';
  notifications?: boolean;
  defaultProjectPath?: string;
  dangerousModeEnabled?: boolean;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivity: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthRequest {
  provider: 'local' | 'github' | 'google' | 'microsoft';
  credentials?: LocalCredentials;
  code?: string; // OAuth authorization code
  state?: string; // OAuth state parameter
}

export interface LocalCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  session?: Session;
  error?: string;
  requiresTwoFactor?: boolean;
}

export interface JWTPayload {
  userId: string;
  sessionId: string;
  role: UserRole;
  exp: number;
  iat: number;
}

export interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  exp: number;
  iat: number;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface RolePermissions {
  [UserRole.ADMIN]: Permission[];
  [UserRole.USER]: Permission[];
  [UserRole.VIEWER]: Permission[];
}

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
  refreshTokenExpiry: string;
  sessionMaxAge: number;
  enabledProviders: Array<'local' | 'github' | 'google' | 'microsoft'>;
  oauth: {
    github?: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    google?: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    microsoft?: {
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
  };
}
