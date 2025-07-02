import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Play,
  Pause,
  BarChart3,
} from 'lucide-react';
import { api } from '../../services/api';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface CLIHealthStatusProps {
  selectedCLI: string | null;
  onSelectCLI: (cli: string) => void;
}

interface HealthStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  availability: 'available' | 'unavailable' | 'partial';
  version?: string;
  lastChecked: string;
  responseTime?: number;
  errors: string[];
  warnings: string[];
  metadata: {
    installPath?: string;
    executablePath?: string;
    configPath?: string;
    isGlobal: boolean;
    dependencies: Array<{
      name: string;
      required: boolean;
      status: 'available' | 'missing' | 'outdated';
      version?: string;
    }>;
  };
  healthChecks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    timestamp: string;
    duration: number;
  }>;
  performance: {
    averageResponseTime: number;
    uptime: number;
    successRate: number;
    lastSuccessfulCommand: string | null;
    commandCount: number;
    errorCount: number;
  };
}

const CLIHealthStatus: React.FC<CLIHealthStatusProps> = ({
  selectedCLI,
  onSelectCLI,
}) => {
  const [monitoringStatus, setMonitoringStatus] = useState<
    Record<string, boolean>
  >({});

  // Fetch all health statuses
  const {
    data: healthStatuses,
    isLoading,
    refetch,
  } = useQuery(
    'cli-health-status',
    () => api.get<HealthStatus[]>('/api/cli-health/status'),
    {
      refetchInterval: 10000, // Refresh every 10 seconds
    }
  );

  // Fetch detailed health status for selected CLI
  const { data: detailedHealth, isLoading: isLoadingDetail } = useQuery(
    ['cli-health-detail', selectedCLI],
    () => api.get<HealthStatus>(`/api/cli-health/status/${selectedCLI}`),
    {
      enabled: !!selectedCLI,
      refetchInterval: 5000,
    }
  );

  // Start monitoring mutation
  const startMonitoringMutation = useMutation(
    (cliName: string) => api.post(`/api/cli-health/monitor/${cliName}/start`),
    {
      onSuccess: (_, cliName) => {
        setMonitoringStatus(prev => ({ ...prev, [cliName]: true }));
        refetch();
      },
    }
  );

  // Stop monitoring mutation
  const stopMonitoringMutation = useMutation(
    (cliName: string) => api.post(`/api/cli-health/monitor/${cliName}/stop`),
    {
      onSuccess: (_, cliName) => {
        setMonitoringStatus(prev => ({ ...prev, [cliName]: false }));
        refetch();
      },
    }
  );

  // Health check mutation
  const healthCheckMutation = useMutation(
    (cliName: string) => api.post(`/api/cli-health/check/${cliName}`),
    {
      onSuccess: () => refetch(),
    }
  );

  // Export health data
  const exportHealthData = async () => {
    try {
      const response = await api.get('/api/cli-health/export', {
        responseType: 'blob',
      });
      const blob = new Blob([response], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cli-health-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export health data:', error);
    }
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className='w-5 h-5 text-green-500' />;
      case 'degraded':
        return <AlertCircle className='w-5 h-5 text-yellow-500' />;
      case 'unhealthy':
        return <XCircle className='w-5 h-5 text-red-500' />;
      default:
        return <AlertCircle className='w-5 h-5 text-gray-400' />;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <RefreshCw className='w-8 h-8 text-gray-400 animate-spin' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Health Overview */}
      <div className='bg-white rounded-lg border border-gray-200 p-6'>
        <div className='flex justify-between items-center mb-6'>
          <h3 className='text-lg font-semibold text-gray-900'>
            Health Monitoring
          </h3>
          <div className='flex gap-2'>
            <button
              onClick={() => refetch()}
              className='flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50'
            >
              <RefreshCw className='w-4 h-4' />
              Refresh
            </button>
            <button
              onClick={exportHealthData}
              className='flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50'
            >
              <Download className='w-4 h-4' />
              Export
            </button>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* CLI List */}
          <div className='space-y-2'>
            <h4 className='text-sm font-medium text-gray-700 mb-3'>
              Monitored CLIs
            </h4>
            <div className='space-y-2'>
              {healthStatuses?.map(health => (
                <div
                  key={health.name}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedCLI === health.name
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => onSelectCLI(health.name)}
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      {getHealthIcon(health.status)}
                      <span className='font-medium text-sm'>{health.name}</span>
                    </div>
                    <div className='flex items-center gap-2'>
                      {health.responseTime && (
                        <span className='text-xs text-gray-500'>
                          {formatDuration(health.responseTime)}
                        </span>
                      )}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (monitoringStatus[health.name]) {
                            stopMonitoringMutation.mutate(health.name);
                          } else {
                            startMonitoringMutation.mutate(health.name);
                          }
                        }}
                        className='text-gray-400 hover:text-gray-600'
                      >
                        {monitoringStatus[health.name] ? (
                          <Pause className='w-4 h-4' />
                        ) : (
                          <Play className='w-4 h-4' />
                        )}
                      </button>
                    </div>
                  </div>
                  {health.errors.length > 0 && (
                    <div className='mt-1 text-xs text-red-600'>
                      {health.errors.length} error
                      {health.errors.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Health View */}
          <div className='lg:col-span-2'>
            {selectedCLI && detailedHealth ? (
              <div className='space-y-4'>
                <h4 className='text-sm font-medium text-gray-700'>
                  {detailedHealth.name} Health Details
                </h4>

                {/* Status Summary */}
                <div className='grid grid-cols-2 gap-4'>
                  <div className='bg-gray-50 p-4 rounded-lg'>
                    <div className='flex items-center justify-between mb-2'>
                      <span className='text-sm text-gray-600'>Status</span>
                      {getHealthIcon(detailedHealth.status)}
                    </div>
                    <p className='text-lg font-semibold capitalize'>
                      {detailedHealth.status}
                    </p>
                  </div>
                  <div className='bg-gray-50 p-4 rounded-lg'>
                    <div className='text-sm text-gray-600 mb-2'>
                      Success Rate
                    </div>
                    <p className='text-lg font-semibold'>
                      {(detailedHealth.performance.successRate * 100).toFixed(
                        1
                      )}
                      %
                    </p>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className='bg-gray-50 p-4 rounded-lg'>
                  <h5 className='text-sm font-medium text-gray-700 mb-3'>
                    Performance
                  </h5>
                  <div className='grid grid-cols-3 gap-4 text-sm'>
                    <div>
                      <span className='text-gray-600'>Avg Response</span>
                      <p className='font-medium'>
                        {formatDuration(
                          detailedHealth.performance.averageResponseTime
                        )}
                      </p>
                    </div>
                    <div>
                      <span className='text-gray-600'>Commands</span>
                      <p className='font-medium'>
                        {detailedHealth.performance.commandCount}
                      </p>
                    </div>
                    <div>
                      <span className='text-gray-600'>Errors</span>
                      <p className='font-medium text-red-600'>
                        {detailedHealth.performance.errorCount}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Health Checks */}
                <div>
                  <h5 className='text-sm font-medium text-gray-700 mb-2'>
                    Recent Health Checks
                  </h5>
                  <div className='space-y-2'>
                    {detailedHealth.healthChecks
                      .slice(0, 5)
                      .map((check, index) => (
                        <div
                          key={index}
                          className='flex items-center justify-between p-2 bg-gray-50 rounded'
                        >
                          <div className='flex items-center gap-2'>
                            {check.status === 'pass' ? (
                              <CheckCircle className='w-4 h-4 text-green-500' />
                            ) : check.status === 'warn' ? (
                              <AlertCircle className='w-4 h-4 text-yellow-500' />
                            ) : (
                              <XCircle className='w-4 h-4 text-red-500' />
                            )}
                            <span className='text-sm'>{check.name}</span>
                          </div>
                          <span className='text-xs text-gray-500'>
                            {formatDuration(check.duration)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Errors and Warnings */}
                {(detailedHealth.errors.length > 0 ||
                  detailedHealth.warnings.length > 0) && (
                  <div className='space-y-2'>
                    {detailedHealth.errors.map((error, index) => (
                      <div
                        key={index}
                        className='p-2 bg-red-50 text-red-700 text-sm rounded'
                      >
                        {error}
                      </div>
                    ))}
                    {detailedHealth.warnings.map((warning, index) => (
                      <div
                        key={index}
                        className='p-2 bg-yellow-50 text-yellow-700 text-sm rounded'
                      >
                        {warning}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className='flex gap-2'>
                  <button
                    onClick={() =>
                      healthCheckMutation.mutate(detailedHealth.name)
                    }
                    className='flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700'
                  >
                    <Activity className='w-4 h-4' />
                    Run Health Check
                  </button>
                </div>
              </div>
            ) : (
              <div className='flex items-center justify-center h-full text-gray-500'>
                Select a CLI to view detailed health information
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CLIHealthStatus;
