import { EventEmitter } from 'events';
import type { AdapterRegistry } from '@vibecode/adapter-sdk';
import type { ProcessHandle, SessionState } from '@vibecode/shared';

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ProcessHandle>();
  private sessions = new Map<string, ManagedSession>();

  constructor(private adapterRegistry: AdapterRegistry) {
    super();
  }

  async createSession(options: SessionOptions): Promise<ManagedSession> {
    const session = new ManagedSession(options, this.adapterRegistry);
    this.sessions.set(session.id, session);
    
    session.on('state-change', (state: SessionState) => {
      this.emit('session-state', session.id, state);
    });

    return session;
  }

  getSession(id: string): ManagedSession | undefined {
    return this.sessions.get(id);
  }

  async terminateSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      await session.terminate();
      this.sessions.delete(id);
    }
  }
}

interface SessionOptions {
  id: string;
  projectId: string;
  adapter: string;
  workingDirectory: string;
}

class ManagedSession extends EventEmitter {
  public readonly id: string;
  private state: SessionState = 'pending';
  private currentProcess?: ProcessHandle;

  constructor(
    private options: SessionOptions,
    private adapterRegistry: AdapterRegistry
  ) {
    super();
    this.id = options.id;
  }

  async execute(command: string): Promise<void> {
    const adapter = this.adapterRegistry.get(this.options.adapter);
    if (!adapter) {
      throw new Error(`Adapter ${this.options.adapter} not found`);
    }

    this.setState('running');
    
    try {
      this.currentProcess = await adapter.execute(command, {
        workingDirectory: this.options.workingDirectory,
      });

      // Handle process completion
      // This would typically listen for process exit events
    } catch (error) {
      this.setState('failed');
      throw error;
    }
  }

  async terminate(): Promise<void> {
    if (this.currentProcess) {
      const adapter = this.adapterRegistry.get(this.options.adapter);
      if (adapter) {
        await adapter.interrupt(this.currentProcess);
      }
    }
    this.setState('stopped');
  }

  private setState(newState: SessionState): void {
    this.state = newState;
    this.emit('state-change', newState);
  }

  getState(): SessionState {
    return this.state;
  }
}