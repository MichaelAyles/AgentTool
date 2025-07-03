import { EventEmitter } from 'events';
import { AgentMessage } from './types';

export interface MessageFilter {
  fromAgent?: string;
  toAgent?: string;
  type?: string;
  priority?: string;
  timestamp?: {
    from?: Date;
    to?: Date;
  };
}

export interface MessageRoute {
  pattern: string;
  handler: string;
  priority: number;
  conditions?: { [key: string]: any };
}

export interface MessageStats {
  totalSent: number;
  totalReceived: number;
  totalRouted: number;
  averageLatency: number;
  messagesByType: { [type: string]: number };
  messagesByAgent: { [agent: string]: number };
  errorRate: number;
}

export class AgentMessageBus extends EventEmitter {
  private messageHistory: Map<string, AgentMessage> = new Map();
  private messageRoutes: MessageRoute[] = [];
  private messageHandlers: Map<string, (message: AgentMessage) => Promise<void>> = new Map();
  private messageQueue: AgentMessage[] = [];
  private isProcessingQueue = false;
  private stats: MessageStats;
  private maxHistorySize = 10000;
  private maxQueueSize = 1000;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.stats = {
      totalSent: 0,
      totalReceived: 0,
      totalRouted: 0,
      averageLatency: 0,
      messagesByType: {},
      messagesByAgent: {},
      errorRate: 0
    };
  }

  public async initialize(): Promise<void> {
    console.log('Initializing Agent Message Bus...');
    
    try {
      // Setup default message routes
      this.setupDefaultRoutes();
      
      // Start message processing
      this.startMessageProcessing();
      
      // Setup periodic cleanup
      this.setupCleanup();
      
      console.log('Agent Message Bus initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Agent Message Bus:', error);
      throw error;
    }
  }

  private setupDefaultRoutes(): void {
    // Default routing rules
    this.addRoute({
      pattern: 'task_assignment',
      handler: 'taskAssignmentHandler',
      priority: 1,
      conditions: { requiresResponse: true }
    });

    this.addRoute({
      pattern: 'status_update',
      handler: 'statusUpdateHandler',
      priority: 3
    });

    this.addRoute({
      pattern: 'coordination',
      handler: 'coordinationHandler',
      priority: 2,
      conditions: { toAgent: 'middle-manager' }
    });

    this.addRoute({
      pattern: 'heartbeat',
      handler: 'heartbeatHandler',
      priority: 5
    });

    this.addRoute({
      pattern: 'error',
      handler: 'errorHandler',
      priority: 1,
      conditions: { urgent: true }
    });
  }

  private startMessageProcessing(): void {
    this.processingInterval = setInterval(async () => {
      if (!this.isProcessingQueue && this.messageQueue.length > 0) {
        this.isProcessingQueue = true;
        await this.processMessageQueue();
        this.isProcessingQueue = false;
      }
    }, 100); // Process every 100ms
  }

  private setupCleanup(): void {
    // Clean up old messages every 5 minutes
    setInterval(() => {
      this.cleanupOldMessages();
    }, 300000);
  }

  public async sendMessage(message: AgentMessage): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Validate message
      this.validateMessage(message);
      
      // Add to queue for processing
      if (this.messageQueue.length >= this.maxQueueSize) {
        throw new Error('Message queue is full');
      }
      
      this.messageQueue.push(message);
      
      // Update stats
      this.stats.totalSent++;
      this.updateMessageStats(message);
      
      console.log(`Message queued: ${message.id} (${message.type}) from ${message.fromAgent} to ${message.toAgent}`);
      
      // Emit event
      this.emit('messageSent', message);
      
    } catch (error) {
      console.error(`Failed to send message ${message.id}:`, error);
      this.stats.errorRate = (this.stats.errorRate + 1) / Math.max(1, this.stats.totalSent);
      throw error;
    }
  }

  private async processMessageQueue(): Promise<void> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      await this.processMessage(message);
    }
  }

  private async processMessage(message: AgentMessage): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Store message in history
      this.addToHistory(message);
      
      // Route message
      await this.routeMessage(message);
      
      // Update latency stats
      const latency = Date.now() - startTime;
      this.updateLatencyStats(latency);
      
      // Update stats
      this.stats.totalRouted++;
      
      console.log(`Message processed: ${message.id} in ${latency}ms`);
      
      // Emit event
      this.emit('messageProcessed', message, latency);
      
    } catch (error) {
      console.error(`Failed to process message ${message.id}:`, error);
      this.emit('messageError', message, error);
    }
  }

  private async routeMessage(message: AgentMessage): Promise<void> {
    // Find matching routes
    const matchingRoutes = this.findMatchingRoutes(message);
    
    if (matchingRoutes.length === 0) {
      console.warn(`No route found for message type: ${message.type}`);
      return;
    }
    
    // Sort by priority and process
    matchingRoutes.sort((a, b) => a.priority - b.priority);
    
    for (const route of matchingRoutes) {
      const handler = this.messageHandlers.get(route.handler);
      if (handler) {
        try {
          await handler(message);
        } catch (error) {
          console.error(`Error in message handler ${route.handler}:`, error);
        }
      } else {
        console.warn(`Handler not found: ${route.handler}`);
      }
    }
  }

  private findMatchingRoutes(message: AgentMessage): MessageRoute[] {
    return this.messageRoutes.filter(route => {
      // Check pattern match
      if (route.pattern !== '*' && route.pattern !== message.type) {
        return false;
      }
      
      // Check conditions
      if (route.conditions) {
        for (const [key, value] of Object.entries(route.conditions)) {
          if (key === 'toAgent' && message.toAgent !== value) {
            return false;
          }
          if (key === 'fromAgent' && message.fromAgent !== value) {
            return false;
          }
          if (key === 'priority' && message.priority !== value) {
            return false;
          }
          if (key === 'requiresResponse' && !message.requiresResponse === value) {
            return false;
          }
        }
      }
      
      return true;
    });
  }

  public addRoute(route: MessageRoute): void {
    this.messageRoutes.push(route);
    this.messageRoutes.sort((a, b) => a.priority - b.priority);
    console.log(`Added message route: ${route.pattern} -> ${route.handler}`);
  }

  public removeRoute(pattern: string, handler: string): void {
    this.messageRoutes = this.messageRoutes.filter(
      route => !(route.pattern === pattern && route.handler === handler)
    );
    console.log(`Removed message route: ${pattern} -> ${handler}`);
  }

  public addHandler(name: string, handler: (message: AgentMessage) => Promise<void>): void {
    this.messageHandlers.set(name, handler);
    console.log(`Added message handler: ${name}`);
  }

  public removeHandler(name: string): void {
    this.messageHandlers.delete(name);
    console.log(`Removed message handler: ${name}`);
  }

  private validateMessage(message: AgentMessage): void {
    if (!message.id) {
      throw new Error('Message ID is required');
    }
    if (!message.type) {
      throw new Error('Message type is required');
    }
    if (!message.fromAgent) {
      throw new Error('Message fromAgent is required');
    }
    if (!message.toAgent) {
      throw new Error('Message toAgent is required');
    }
    if (!message.timestamp) {
      throw new Error('Message timestamp is required');
    }
  }

  private addToHistory(message: AgentMessage): void {
    this.messageHistory.set(message.id, message);
    
    // Trim history if too large
    if (this.messageHistory.size > this.maxHistorySize) {
      const entries = Array.from(this.messageHistory.entries());
      entries.sort((a, b) => b[1].timestamp.getTime() - a[1].timestamp.getTime());
      
      this.messageHistory.clear();
      entries.slice(0, this.maxHistorySize).forEach(([id, msg]) => {
        this.messageHistory.set(id, msg);
      });
    }
  }

  private updateMessageStats(message: AgentMessage): void {
    // Update type stats
    this.stats.messagesByType[message.type] = 
      (this.stats.messagesByType[message.type] || 0) + 1;
    
    // Update agent stats
    this.stats.messagesByAgent[message.fromAgent] = 
      (this.stats.messagesByAgent[message.fromAgent] || 0) + 1;
  }

  private updateLatencyStats(latency: number): void {
    const totalMessages = this.stats.totalRouted + 1;
    this.stats.averageLatency = 
      ((this.stats.averageLatency * this.stats.totalRouted) + latency) / totalMessages;
  }

  private cleanupOldMessages(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    let removedCount = 0;
    
    for (const [id, message] of this.messageHistory.entries()) {
      if (message.timestamp.getTime() < cutoffTime) {
        this.messageHistory.delete(id);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} old messages`);
    }
  }

  // Query methods
  public getMessages(filter?: MessageFilter, limit?: number): AgentMessage[] {
    let messages = Array.from(this.messageHistory.values());
    
    if (filter) {
      messages = messages.filter(message => {
        if (filter.fromAgent && message.fromAgent !== filter.fromAgent) {
          return false;
        }
        if (filter.toAgent && message.toAgent !== filter.toAgent) {
          return false;
        }
        if (filter.type && message.type !== filter.type) {
          return false;
        }
        if (filter.priority && message.priority !== filter.priority) {
          return false;
        }
        if (filter.timestamp) {
          const msgTime = message.timestamp.getTime();
          if (filter.timestamp.from && msgTime < filter.timestamp.from.getTime()) {
            return false;
          }
          if (filter.timestamp.to && msgTime > filter.timestamp.to.getTime()) {
            return false;
          }
        }
        return true;
      });
    }
    
    // Sort by timestamp (newest first)
    messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return limit ? messages.slice(0, limit) : messages;
  }

  public getMessage(id: string): AgentMessage | undefined {
    return this.messageHistory.get(id);
  }

  public getMessagesByAgent(agentId: string, limit?: number): AgentMessage[] {
    return this.getMessages({ fromAgent: agentId }, limit);
  }

  public getMessagesByType(type: string, limit?: number): AgentMessage[] {
    return this.getMessages({ type }, limit);
  }

  public getConversation(agent1: string, agent2: string, limit?: number): AgentMessage[] {
    const messages = Array.from(this.messageHistory.values()).filter(message => 
      (message.fromAgent === agent1 && message.toAgent === agent2) ||
      (message.fromAgent === agent2 && message.toAgent === agent1)
    );
    
    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return limit ? messages.slice(-limit) : messages;
  }

  public getStats(): MessageStats {
    return { ...this.stats };
  }

  public getRoutes(): MessageRoute[] {
    return [...this.messageRoutes];
  }

  public getHandlers(): string[] {
    return Array.from(this.messageHandlers.keys());
  }

  public getQueueSize(): number {
    return this.messageQueue.length;
  }

  public getHistorySize(): number {
    return this.messageHistory.size;
  }

  // Broadcasting methods
  public async broadcastMessage(
    message: Omit<AgentMessage, 'toAgent'>,
    excludeAgents?: string[]
  ): Promise<void> {
    const broadcastMessage: AgentMessage = {
      ...message,
      toAgent: 'broadcast'
    } as AgentMessage;
    
    await this.sendMessage(broadcastMessage);
    
    // Emit broadcast event with exclusions
    this.emit('messageBroadcast', broadcastMessage, excludeAgents);
  }

  public async sendMessageWithResponse(
    message: AgentMessage,
    timeout: number = 30000
  ): Promise<AgentMessage> {
    // Set requiresResponse flag
    message.requiresResponse = true;
    message.timeout = timeout;
    
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.removeListener('messageReceived', responseHandler);
        reject(new Error(`Message response timeout for ${message.id}`));
      }, timeout);
      
      const responseHandler = (response: AgentMessage) => {
        if (response.correlationId === message.id) {
          clearTimeout(timeoutHandle);
          this.removeListener('messageReceived', responseHandler);
          resolve(response);
        }
      };
      
      this.on('messageReceived', responseHandler);
      
      // Send the message
      this.sendMessage(message).catch(error => {
        clearTimeout(timeoutHandle);
        this.removeListener('messageReceived', responseHandler);
        reject(error);
      });
    });
  }

  // Admin methods
  public clearHistory(): void {
    this.messageHistory.clear();
    console.log('Message history cleared');
  }

  public resetStats(): void {
    this.stats = {
      totalSent: 0,
      totalReceived: 0,
      totalRouted: 0,
      averageLatency: 0,
      messagesByType: {},
      messagesByAgent: {},
      errorRate: 0
    };
    console.log('Message stats reset');
  }

  public exportHistory(): string {
    const history = Array.from(this.messageHistory.values());
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      messageCount: history.length,
      messages: history,
      stats: this.stats
    }, null, 2);
  }

  public async shutdown(): Promise<void> {
    console.log('Shutting down Agent Message Bus...');
    
    // Clear processing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    // Process remaining messages
    if (this.messageQueue.length > 0) {
      console.log(`Processing ${this.messageQueue.length} remaining messages...`);
      await this.processMessageQueue();
    }
    
    // Clear data
    this.messageQueue = [];
    this.messageHandlers.clear();
    this.messageRoutes = [];
    
    console.log('Agent Message Bus shut down successfully');
  }
}