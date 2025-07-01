import { EventEmitter } from 'events';
import { structuredLogger } from '../middleware/logging.js';

export interface ServiceEndpoint {
  id: string;
  serviceName: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'tcp' | 'udp';
  health: 'healthy' | 'unhealthy' | 'unknown';
  weight: number;
  metadata: Record<string, string>;
  tags: string[];
}

export interface ServiceRoute {
  id: string;
  name: string;
  serviceName: string;
  path: string;
  method: string[];
  headers: Record<string, string>;
  timeout: number;
  retries: number;
  circuitBreaker: {
    enabled: boolean;
    threshold: number;
    timeout: number;
    halfOpenMax: number;
  };
  loadBalancing: {
    strategy: 'round_robin' | 'weighted' | 'least_connections' | 'ip_hash';
    healthCheck: boolean;
  };
}

export interface TrafficPolicy {
  serviceName: string;
  rules: Array<{
    match: {
      headers?: Record<string, string>;
      queryParams?: Record<string, string>;
      sourceLabels?: Record<string, string>;
    };
    destination: {
      service: string;
      subset?: string;
      weight?: number;
    };
    fault?: {
      delay?: { percentage: number; fixedDelay: number };
      abort?: { percentage: number; httpStatus: number };
    };
    mirror?: {
      service: string;
      percentage: number;
    };
  }>;
}

export interface CircuitBreakerState {
  serviceId: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: Date;
  nextAttemptTime: Date;
  successCount: number;
}

export interface MetricsData {
  requests: {
    total: number;
    success: number;
    error: number;
    latency: {
      p50: number;
      p95: number;
      p99: number;
    };
  };
  connections: {
    active: number;
    total: number;
  };
  circuitBreakers: {
    open: number;
    halfOpen: number;
  };
}

export class ServiceMesh extends EventEmitter {
  private services = new Map<string, ServiceEndpoint[]>();
  private routes = new Map<string, ServiceRoute>();
  private trafficPolicies = new Map<string, TrafficPolicy>();
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private metrics = new Map<string, MetricsData>();
  
  private healthCheckInterval: NodeJS.Timeout;
  private metricsCollectionInterval: NodeJS.Timeout;
  
  private config = {
    healthCheckInterval: 30000,
    metricsInterval: 10000,
    defaultTimeout: 30000,
    defaultRetries: 3,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000,
  };

  constructor() {
    super();
    
    this.startHealthChecking();
    this.startMetricsCollection();
    
    structuredLogger.info('Service mesh initialized');
  }

  /**
   * Register a service endpoint
   */
  registerService(endpoint: ServiceEndpoint): void {
    if (!this.services.has(endpoint.serviceName)) {
      this.services.set(endpoint.serviceName, []);
    }
    
    const endpoints = this.services.get(endpoint.serviceName)!;
    const existingIndex = endpoints.findIndex(e => e.id === endpoint.id);
    
    if (existingIndex >= 0) {
      endpoints[existingIndex] = endpoint;
    } else {
      endpoints.push(endpoint);
    }
    
    this.emit('serviceRegistered', endpoint);
    structuredLogger.info('Service endpoint registered', {
      serviceName: endpoint.serviceName,
      endpointId: endpoint.id,
      host: endpoint.host,
      port: endpoint.port,
    });
  }

  /**
   * Deregister a service endpoint
   */
  deregisterService(serviceName: string, endpointId: string): boolean {
    const endpoints = this.services.get(serviceName);
    if (!endpoints) return false;
    
    const index = endpoints.findIndex(e => e.id === endpointId);
    if (index >= 0) {
      const removed = endpoints.splice(index, 1)[0];
      
      if (endpoints.length === 0) {
        this.services.delete(serviceName);
      }
      
      this.emit('serviceDeregistered', removed);
      structuredLogger.info('Service endpoint deregistered', {
        serviceName,
        endpointId,
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * Create or update a service route
   */
  createRoute(route: ServiceRoute): void {
    this.routes.set(route.id, route);
    
    this.emit('routeCreated', route);
    structuredLogger.info('Service route created', {
      routeId: route.id,
      serviceName: route.serviceName,
      path: route.path,
      methods: route.method,
    });
  }

  /**
   * Remove a service route
   */
  removeRoute(routeId: string): boolean {
    const route = this.routes.get(routeId);
    if (route) {
      this.routes.delete(routeId);
      this.emit('routeRemoved', route);
      structuredLogger.info('Service route removed', { routeId });
      return true;
    }
    return false;
  }

  /**
   * Set traffic policy for a service
   */
  setTrafficPolicy(policy: TrafficPolicy): void {
    this.trafficPolicies.set(policy.serviceName, policy);
    
    this.emit('trafficPolicySet', policy);
    structuredLogger.info('Traffic policy set', {
      serviceName: policy.serviceName,
      rules: policy.rules.length,
    });
  }

  /**
   * Route a request to appropriate service endpoint
   */
  async routeRequest(
    serviceName: string,
    request: {
      path: string;
      method: string;
      headers: Record<string, string>;
      body?: any;
    }
  ): Promise<{
    endpoint: ServiceEndpoint | null;
    route: ServiceRoute | null;
    error?: string;
  }> {
    try {
      // Find matching route
      const route = this.findMatchingRoute(serviceName, request.path, request.method);
      if (!route) {
        return {
          endpoint: null,
          route: null,
          error: `No route found for ${request.method} ${request.path}`,
        };
      }

      // Apply traffic policy if exists
      const policy = this.trafficPolicies.get(serviceName);
      if (policy) {
        const policyResult = this.applyTrafficPolicy(policy, request);
        if (policyResult.redirect) {
          serviceName = policyResult.redirect;
        }
        if (policyResult.fault) {
          return {
            endpoint: null,
            route,
            error: `Simulated fault: ${policyResult.fault}`,
          };
        }
      }

      // Get healthy endpoint
      const endpoint = this.selectEndpoint(serviceName, route.loadBalancing.strategy);
      if (!endpoint) {
        return {
          endpoint: null,
          route,
          error: `No healthy endpoints available for ${serviceName}`,
        };
      }

      // Check circuit breaker
      const circuitBreaker = this.circuitBreakers.get(endpoint.id);
      if (circuitBreaker && circuitBreaker.state === 'open') {
        if (Date.now() < circuitBreaker.nextAttemptTime.getTime()) {
          return {
            endpoint: null,
            route,
            error: `Circuit breaker open for ${endpoint.id}`,
          };
        } else {
          // Move to half-open state
          circuitBreaker.state = 'half-open';
          circuitBreaker.successCount = 0;
        }
      }

      return { endpoint, route };
    } catch (error) {
      structuredLogger.error('Request routing failed', error as Error, {
        serviceName,
        path: request.path,
        method: request.method,
      });
      
      return {
        endpoint: null,
        route: null,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Record request result for metrics and circuit breaker
   */
  recordRequestResult(
    endpointId: string,
    success: boolean,
    latency: number
  ): void {
    // Update circuit breaker state
    this.updateCircuitBreaker(endpointId, success);
    
    // Update metrics
    this.updateMetrics(endpointId, success, latency);
    
    this.emit('requestRecorded', {
      endpointId,
      success,
      latency,
    });
  }

  /**
   * Get service discovery information
   */
  discoverServices(serviceName?: string): {
    serviceName: string;
    endpoints: ServiceEndpoint[];
  }[] {
    if (serviceName) {
      const endpoints = this.services.get(serviceName) || [];
      return [{ serviceName, endpoints }];
    }
    
    return Array.from(this.services.entries()).map(([name, endpoints]) => ({
      serviceName: name,
      endpoints,
    }));
  }

  /**
   * Get service mesh metrics
   */
  getMetrics(serviceName?: string): Record<string, MetricsData> {
    if (serviceName) {
      const serviceMetrics: Record<string, MetricsData> = {};
      const endpoints = this.services.get(serviceName) || [];
      
      for (const endpoint of endpoints) {
        const metrics = this.metrics.get(endpoint.id);
        if (metrics) {
          serviceMetrics[endpoint.id] = metrics;
        }
      }
      
      return serviceMetrics;
    }
    
    return Object.fromEntries(this.metrics.entries());
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): CircuitBreakerState[] {
    return Array.from(this.circuitBreakers.values());
  }

  /**
   * Force circuit breaker state change
   */
  setCircuitBreakerState(endpointId: string, state: 'open' | 'closed'): boolean {
    const circuitBreaker = this.circuitBreakers.get(endpointId);
    if (!circuitBreaker) return false;
    
    circuitBreaker.state = state;
    if (state === 'closed') {
      circuitBreaker.failureCount = 0;
      circuitBreaker.successCount = 0;
    }
    
    structuredLogger.info('Circuit breaker state changed', {
      endpointId,
      state,
    });
    
    return true;
  }

  // Private methods

  private findMatchingRoute(
    serviceName: string,
    path: string,
    method: string
  ): ServiceRoute | null {
    const routes = Array.from(this.routes.values())
      .filter(r => r.serviceName === serviceName);
    
    for (const route of routes) {
      if (route.method.includes(method.toUpperCase()) || route.method.includes('*')) {
        if (this.pathMatches(route.path, path)) {
          return route;
        }
      }
    }
    
    return null;
  }

  private pathMatches(routePath: string, requestPath: string): boolean {
    // Simple path matching - could be enhanced with regex or glob patterns
    if (routePath === requestPath) return true;
    if (routePath.endsWith('*')) {
      const prefix = routePath.slice(0, -1);
      return requestPath.startsWith(prefix);
    }
    return false;
  }

  private applyTrafficPolicy(
    policy: TrafficPolicy,
    request: any
  ): {
    redirect?: string;
    fault?: string;
    mirror?: string;
  } {
    for (const rule of policy.rules) {
      if (this.matchesRule(rule.match, request)) {
        // Apply fault injection
        if (rule.fault) {
          if (rule.fault.delay && Math.random() < rule.fault.delay.percentage / 100) {
            // Would add delay here
          }
          if (rule.fault.abort && Math.random() < rule.fault.abort.percentage / 100) {
            return { fault: `HTTP ${rule.fault.abort.httpStatus}` };
          }
        }
        
        // Apply traffic splitting/redirection
        if (rule.destination.service !== policy.serviceName) {
          return { redirect: rule.destination.service };
        }
        
        // Apply mirroring
        if (rule.mirror) {
          return { mirror: rule.mirror.service };
        }
      }
    }
    
    return {};
  }

  private matchesRule(match: any, request: any): boolean {
    // Simple matching logic - could be enhanced
    if (match.headers) {
      for (const [key, value] of Object.entries(match.headers)) {
        if (request.headers[key] !== value) {
          return false;
        }
      }
    }
    
    return true;
  }

  private selectEndpoint(
    serviceName: string,
    strategy: string
  ): ServiceEndpoint | null {
    const endpoints = this.services.get(serviceName) || [];
    const healthyEndpoints = endpoints.filter(e => e.health === 'healthy');
    
    if (healthyEndpoints.length === 0) {
      return null;
    }
    
    switch (strategy) {
      case 'round_robin':
        // Simple round-robin (stateless)
        const index = Math.floor(Math.random() * healthyEndpoints.length);
        return healthyEndpoints[index];
      
      case 'weighted':
        return this.selectWeightedEndpoint(healthyEndpoints);
      
      case 'least_connections':
        // Would need to track active connections
        return healthyEndpoints[0];
      
      case 'ip_hash':
        // Would need client IP for consistent hashing
        return healthyEndpoints[0];
      
      default:
        return healthyEndpoints[0];
    }
  }

  private selectWeightedEndpoint(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const endpoint of endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }
    
    return endpoints[0];
  }

  private updateCircuitBreaker(endpointId: string, success: boolean): void {
    let circuitBreaker = this.circuitBreakers.get(endpointId);
    
    if (!circuitBreaker) {
      circuitBreaker = {
        serviceId: endpointId,
        state: 'closed',
        failureCount: 0,
        lastFailureTime: new Date(),
        nextAttemptTime: new Date(),
        successCount: 0,
      };
      this.circuitBreakers.set(endpointId, circuitBreaker);
    }
    
    if (success) {
      if (circuitBreaker.state === 'half-open') {
        circuitBreaker.successCount++;
        if (circuitBreaker.successCount >= 3) {
          // Close the circuit breaker
          circuitBreaker.state = 'closed';
          circuitBreaker.failureCount = 0;
          circuitBreaker.successCount = 0;
        }
      } else if (circuitBreaker.state === 'closed') {
        circuitBreaker.failureCount = 0;
      }
    } else {
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailureTime = new Date();
      
      if (circuitBreaker.state === 'closed' && 
          circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
        // Open the circuit breaker
        circuitBreaker.state = 'open';
        circuitBreaker.nextAttemptTime = new Date(
          Date.now() + this.config.circuitBreakerTimeout
        );
        
        this.emit('circuitBreakerOpened', { endpointId });
      } else if (circuitBreaker.state === 'half-open') {
        // Go back to open state
        circuitBreaker.state = 'open';
        circuitBreaker.nextAttemptTime = new Date(
          Date.now() + this.config.circuitBreakerTimeout
        );
      }
    }
  }

  private updateMetrics(endpointId: string, success: boolean, latency: number): void {
    let metrics = this.metrics.get(endpointId);
    
    if (!metrics) {
      metrics = {
        requests: {
          total: 0,
          success: 0,
          error: 0,
          latency: { p50: 0, p95: 0, p99: 0 },
        },
        connections: {
          active: 0,
          total: 0,
        },
        circuitBreakers: {
          open: 0,
          halfOpen: 0,
        },
      };
      this.metrics.set(endpointId, metrics);
    }
    
    metrics.requests.total++;
    if (success) {
      metrics.requests.success++;
    } else {
      metrics.requests.error++;
    }
    
    // Update latency percentiles (simplified)
    metrics.requests.latency.p50 = (metrics.requests.latency.p50 + latency) / 2;
    metrics.requests.latency.p95 = Math.max(metrics.requests.latency.p95, latency);
    metrics.requests.latency.p99 = Math.max(metrics.requests.latency.p99, latency);
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(async () => {
      for (const [serviceName, endpoints] of this.services.entries()) {
        for (const endpoint of endpoints) {
          await this.performHealthCheck(endpoint);
        }
      }
    }, this.config.healthCheckInterval);
  }

  private async performHealthCheck(endpoint: ServiceEndpoint): Promise<void> {
    try {
      // Simple health check - in a real implementation, this would make an HTTP request
      // or check if the container/process is running
      const isHealthy = Math.random() > 0.1; // 90% success rate for simulation
      
      const oldHealth = endpoint.health;
      endpoint.health = isHealthy ? 'healthy' : 'unhealthy';
      
      if (oldHealth !== endpoint.health) {
        this.emit('healthChanged', endpoint);
        structuredLogger.info('Endpoint health changed', {
          endpointId: endpoint.id,
          serviceName: endpoint.serviceName,
          health: endpoint.health,
        });
      }
    } catch (error) {
      endpoint.health = 'unhealthy';
      structuredLogger.error('Health check failed', error as Error, {
        endpointId: endpoint.id,
      });
    }
  }

  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(() => {
      // Collect and aggregate metrics
      const totalRequests = Array.from(this.metrics.values())
        .reduce((sum, m) => sum + m.requests.total, 0);
      
      this.emit('metricsCollected', {
        timestamp: new Date(),
        totalRequests,
        totalServices: this.services.size,
        totalEndpoints: Array.from(this.services.values())
          .reduce((sum, endpoints) => sum + endpoints.length, 0),
      });
    }, this.config.metricsInterval);
  }

  /**
   * Close the service mesh
   */
  close(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
    }
    
    this.removeAllListeners();
    structuredLogger.info('Service mesh closed');
  }
}

// Export singleton instance
export const serviceMesh = new ServiceMesh();