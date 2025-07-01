import type { Project } from '@vibecode/shared';

const API_BASE = '/api';

class ApiService {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects');
  }

  async createProject(data: { name: string; path: string }): Promise<Project> {
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
}

export const api = new ApiService();