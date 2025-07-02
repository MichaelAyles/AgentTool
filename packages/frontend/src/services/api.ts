import type { Project } from '../types';

// Configuration for backend selection
interface BackendConfig {
  type: 'cloud' | 'local' | 'auto';
  localUrl?: string;
  cloudUrl?: string;
}

// Default configuration
const DEFAULT_CONFIG: BackendConfig = {
  type: 'auto',
  localUrl: 'http://localhost:3000',
  cloudUrl: window.location.origin,
};

class BackendDetector {
  private config: BackendConfig = DEFAULT_CONFIG;
  private detectedBackend: 'cloud' | 'local' | null = null;

  async detectBackend(): Promise<string> {
    if (this.detectedBackend && this.config.type === 'auto') {
      return this.detectedBackend === 'local'
        ? this.config.localUrl!
        : this.config.cloudUrl!;
    }

    if (this.config.type === 'local') {
      return this.config.localUrl!;
    }

    if (this.config.type === 'cloud') {
      return this.config.cloudUrl!;
    }

    // Auto-detect: try local first, fallback to cloud
    try {
      const response = await fetch(`${this.config.localUrl}/api/v1/health`, {
        method: 'GET',
        timeout: 2000,
      } as any);

      if (response.ok) {
        const data = await response.json();
        if (data.type === 'desktop-connector') {
          this.detectedBackend = 'local';
          return this.config.localUrl!;
        }
      }
    } catch (error) {
      // Local backend not available
    }

    // Fallback to cloud
    this.detectedBackend = 'cloud';
    return this.config.cloudUrl!;
  }

  setConfig(config: Partial<BackendConfig>) {
    this.config = { ...this.config, ...config };
    this.detectedBackend = null; // Reset detection
  }

  getConfig(): BackendConfig {
    return { ...this.config };
  }

  isLocal(): boolean {
    return this.detectedBackend === 'local';
  }
}

const backendDetector = new BackendDetector();

class ApiService {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const baseUrl = await backendDetector.detectBackend();
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

  async createSession(data: { projectId: string; adapter: string }) {
    return this.request('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Backend configuration methods
  setBackendConfig(config: Partial<BackendConfig>) {
    backendDetector.setConfig(config);
  }

  getBackendConfig(): BackendConfig {
    return backendDetector.getConfig();
  }

  isLocalBackend(): boolean {
    return backendDetector.isLocal();
  }

  async getSystemInfo() {
    return this.request('/system/info');
  }
}

export const api = new ApiService();
