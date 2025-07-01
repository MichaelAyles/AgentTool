import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useUIActions } from '../store';

interface ProcessMetrics {
  sessionId: string;
  projectId: string;
  adapter: string;
  state: string;
  cpuUsage: number;
  memoryUsage: number;
  runtime: number;
  commandsExecuted: number;
  lastActivity: number;
}

interface HealthStatus {
  healthy: boolean;
  activeSessions: number;
  totalProcesses: number;
  averageMemoryUsage: number;
  averageCpuUsage: number;
}

interface ResourceLimits {
  maxMemoryMB: number;
  maxCpuPercent: number;
  maxRuntimeMs: number;
  maxIdleTimeMs: number;
}

export function ProcessMonitor() {
  const [metrics, setMetrics] = useState<ProcessMetrics[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [limits, setLimits] = useState<ResourceLimits | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const socket = useSocket();
  const { addNotification } = useUIActions();

  // Fetch initial data
  const { data: initialMetrics } = useQuery({
    queryKey: ['process-metrics'],
    queryFn: async () => {
      const response = await fetch('/api/processes/metrics');
      return response.json();
    },
  });

  const { data: initialHealth } = useQuery({
    queryKey: ['process-health'],
    queryFn: async () => {
      const response = await fetch('/api/processes/health');
      return response.json();
    },
  });

  const { data: initialLimits } = useQuery({
    queryKey: ['process-limits'],
    queryFn: async () => {
      const response = await fetch('/api/processes/limits');
      return response.json();
    },
  });

  // Update state when initial data loads
  useEffect(() => {
    if (initialMetrics) setMetrics(initialMetrics);
  }, [initialMetrics]);

  useEffect(() => {
    if (initialHealth) setHealth(initialHealth);
  }, [initialHealth]);

  useEffect(() => {
    if (initialLimits) setLimits(initialLimits);
  }, [initialLimits]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleMetricsUpdate = (data: {
      health: HealthStatus;
      metrics: ProcessMetrics[];
    }) => {
      setHealth(data.health);
      setMetrics(data.metrics);
    };

    const handleResourceLimitExceeded = (data: any) => {
      addNotification({
        type: 'warning',
        message: `Session ${data.sessionId} exceeded ${data.type} limit (${data.current}/${data.limit})`,
      });
    };

    const handleSessionWarning = (data: any) => {
      addNotification({
        type: 'warning',
        message: data.message,
      });
    };

    const handleSessionTerminated = (data: { sessionId: string }) => {
      addNotification({
        type: 'info',
        message: `Session ${data.sessionId} was terminated`,
      });
      setMetrics(prev => prev.filter(m => m.sessionId !== data.sessionId));
    };

    socket.on('process:metrics-update', handleMetricsUpdate);
    socket.on('process:resource-limit-exceeded', handleResourceLimitExceeded);
    socket.on('process:session-warning', handleSessionWarning);
    socket.on('process:session-terminated', handleSessionTerminated);

    return () => {
      socket.off('process:metrics-update', handleMetricsUpdate);
      socket.off(
        'process:resource-limit-exceeded',
        handleResourceLimitExceeded
      );
      socket.off('process:session-warning', handleSessionWarning);
      socket.off('process:session-terminated', handleSessionTerminated);
    };
  }, [socket, addNotification]);

  const terminateSession = (sessionId: string) => {
    if (
      socket &&
      window.confirm('Are you sure you want to terminate this session?')
    ) {
      socket.emit('process:terminate-session', { sessionId });
    }
  };

  const formatRuntime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'running':
        return 'text-green-600 bg-green-100';
      case 'idle':
        return 'text-blue-600 bg-blue-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'stopped':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-yellow-600 bg-yellow-100';
    }
  };

  const getUsageColor = (usage: number, limit: number) => {
    const percentage = (usage / limit) * 100;
    if (percentage > 80) return 'text-red-600';
    if (percentage > 60) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (!health || !limits) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='text-gray-500'>Loading process monitor...</div>
      </div>
    );
  }

  return (
    <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
      <div className='mb-8'>
        <h1 className='text-2xl font-bold text-gray-900 dark:text-white mb-4'>
          Process Monitor
        </h1>

        {/* Health Overview */}
        <div className='grid grid-cols-1 md:grid-cols-5 gap-4 mb-6'>
          <div className='bg-white dark:bg-gray-800 p-4 rounded-lg shadow'>
            <div className='text-sm text-gray-500 dark:text-gray-400'>
              System Health
            </div>
            <div
              className={`text-lg font-semibold ${health.healthy ? 'text-green-600' : 'text-red-600'}`}
            >
              {health.healthy ? 'Healthy' : 'Unhealthy'}
            </div>
          </div>

          <div className='bg-white dark:bg-gray-800 p-4 rounded-lg shadow'>
            <div className='text-sm text-gray-500 dark:text-gray-400'>
              Active Sessions
            </div>
            <div className='text-lg font-semibold text-gray-900 dark:text-white'>
              {health.activeSessions}
            </div>
          </div>

          <div className='bg-white dark:bg-gray-800 p-4 rounded-lg shadow'>
            <div className='text-sm text-gray-500 dark:text-gray-400'>
              Total Processes
            </div>
            <div className='text-lg font-semibold text-gray-900 dark:text-white'>
              {health.totalProcesses}
            </div>
          </div>

          <div className='bg-white dark:bg-gray-800 p-4 rounded-lg shadow'>
            <div className='text-sm text-gray-500 dark:text-gray-400'>
              Avg Memory
            </div>
            <div
              className={`text-lg font-semibold ${getUsageColor(health.averageMemoryUsage, limits.maxMemoryMB)}`}
            >
              {health.averageMemoryUsage.toFixed(1)} MB
            </div>
          </div>

          <div className='bg-white dark:bg-gray-800 p-4 rounded-lg shadow'>
            <div className='text-sm text-gray-500 dark:text-gray-400'>
              Avg CPU
            </div>
            <div
              className={`text-lg font-semibold ${getUsageColor(health.averageCpuUsage, limits.maxCpuPercent)}`}
            >
              {health.averageCpuUsage.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Resource Limits */}
        <div className='bg-white dark:bg-gray-800 p-4 rounded-lg shadow mb-6'>
          <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-3'>
            Resource Limits
          </h3>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
            <div>
              <span className='text-gray-500 dark:text-gray-400'>
                Max Memory:
              </span>
              <span className='ml-2 font-medium'>{limits.maxMemoryMB} MB</span>
            </div>
            <div>
              <span className='text-gray-500 dark:text-gray-400'>Max CPU:</span>
              <span className='ml-2 font-medium'>{limits.maxCpuPercent}%</span>
            </div>
            <div>
              <span className='text-gray-500 dark:text-gray-400'>
                Max Runtime:
              </span>
              <span className='ml-2 font-medium'>
                {formatRuntime(limits.maxRuntimeMs)}
              </span>
            </div>
            <div>
              <span className='text-gray-500 dark:text-gray-400'>
                Max Idle:
              </span>
              <span className='ml-2 font-medium'>
                {formatRuntime(limits.maxIdleTimeMs)}
              </span>
            </div>
          </div>
        </div>

        {/* Sessions Table */}
        <div className='bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden'>
          <div className='px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
            <h3 className='text-lg font-medium text-gray-900 dark:text-white'>
              Active Sessions
            </h3>
          </div>

          {metrics.length === 0 ? (
            <div className='p-6 text-center text-gray-500 dark:text-gray-400'>
              No active sessions
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
                <thead className='bg-gray-50 dark:bg-gray-700'>
                  <tr>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      Session
                    </th>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      State
                    </th>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      Memory
                    </th>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      CPU
                    </th>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      Runtime
                    </th>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      Commands
                    </th>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      Last Activity
                    </th>
                    <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider'>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className='bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700'>
                  {metrics.map(metric => (
                    <tr key={metric.sessionId}>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <div className='text-sm text-gray-900 dark:text-white font-medium'>
                          {metric.sessionId.slice(0, 8)}...
                        </div>
                        <div className='text-sm text-gray-500 dark:text-gray-400'>
                          {metric.adapter}
                        </div>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap'>
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStateColor(metric.state)}`}
                        >
                          {metric.state}
                        </span>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm'>
                        <span
                          className={getUsageColor(
                            metric.memoryUsage,
                            limits.maxMemoryMB
                          )}
                        >
                          {metric.memoryUsage.toFixed(1)} MB
                        </span>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm'>
                        <span
                          className={getUsageColor(
                            metric.cpuUsage,
                            limits.maxCpuPercent
                          )}
                        >
                          {metric.cpuUsage.toFixed(1)}%
                        </span>
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white'>
                        {formatRuntime(metric.runtime)}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white'>
                        {metric.commandsExecuted}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white'>
                        {formatTimestamp(metric.lastActivity)}
                      </td>
                      <td className='px-6 py-4 whitespace-nowrap text-sm'>
                        <button
                          onClick={() => terminateSession(metric.sessionId)}
                          className='text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300'
                        >
                          Terminate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
