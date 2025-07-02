import type { Project } from '../types';

// Configuration for centralized backend
interface BackendConfig {
  centralUrl: string;
  sessionEndpoint: string;
  streamEndpoint: string;
}

// Default configuration - always use centralized service
const DEFAULT_CONFIG: BackendConfig = {
  centralUrl: 'https://vibe.theduck.chat',
  sessionEndpoint: '/api/v1/sessions',
  streamEndpoint: '/api/v1/stream',
};

class CentralizedBackend {
  private config: BackendConfig = DEFAULT_CONFIG;

  getApiUrl(): string {
    return this.config.centralUrl;
  }

  getSessionUrl(sessionId?: string): string {
    const base = `${this.config.centralUrl}${this.config.sessionEndpoint}`;
    return sessionId ? `${base}/${sessionId}` : base;
  }

  getStreamUrl(sessionId: string): string {
    return `${this.config.centralUrl}${this.config.streamEndpoint}/${sessionId}`;
  }

  getWebSocketUrl(sessionId: string): string {
    const wsUrl = this.config.centralUrl
      .replace('https:', 'wss:')
      .replace('http:', 'ws:');
    return `${wsUrl}/ws/${sessionId}`;
  }

  setConfig(config: Partial<BackendConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): BackendConfig {
    return { ...this.config };
  }
}

const centralizedBackend = new CentralizedBackend();

class ApiService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const baseUrl = centralizedBackend.getApiUrl();
    const response = await fetch(`${baseUrl}/api/v1${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: response.statusText }));
      throw new Error(
        error.message || `API request failed: ${response.statusText}`
      );
    }

    // Handle blob responses
    if ((options as any)?.responseType === 'blob') {
      return response.blob() as any;
    }

    return response.json();
  }

  // Generic HTTP methods
  async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    data?: any,
    options?: RequestInit
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(
    endpoint: string,
    data?: any,
    options?: RequestInit
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects');
  }

  async createProject(data: {
    name: string;
    path: string;
    activeAdapter: string;
  }): Promise<Project> {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAdapters() {
    return this.request('/adapters');
  }

  // Session-based API methods
  async getSessionStatus(sessionId: string) {
    return this.request(`/sessions/${sessionId}/status`);
  }

  async createSession(sessionId: string) {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async sendCommand(sessionId: string, command: string) {
    return this.request(`/sessions/${sessionId}/commands`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  }

  // Backend configuration methods
  setCentralBackendConfig(config: Partial<BackendConfig>) {
    centralizedBackend.setConfig(config);
  }

  getCentralBackendConfig(): BackendConfig {
    return centralizedBackend.getConfig();
  }

  getWebSocketUrl(sessionId: string): string {
    return centralizedBackend.getWebSocketUrl(sessionId);
  }

  async getSystemInfo() {
    return this.request('/system/info');
  }
}

export const api = new ApiService();
