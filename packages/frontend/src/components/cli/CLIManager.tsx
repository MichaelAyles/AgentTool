import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Terminal,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Activity,
  Settings,
  Info,
  Shield,
} from 'lucide-react';
import { api } from '../../services/api';
import CLIHealthStatus from './CLIHealthStatus';
import CLIInstaller from './CLIInstaller';
import CLIConfiguration from './CLIConfiguration';

interface CLIInfo {
  name: string;
  command: string;
  version?: string;
  available: boolean;
  installed: boolean;
  health?: {
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    availability: 'available' | 'unavailable' | 'partial';
    lastChecked: string;
    responseTime?: number;
    errorCount: number;
    warningCount: number;
  };
}

const CLIManager: React.FC = () => {
  const [selectedCLI, setSelectedCLI] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'health' | 'install' | 'config'
  >('overview');
  const queryClient = useQueryClient();

  // Fetch CLI status with health info
  const {
    data: cliStatus,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cli-status'],
    queryFn: () => api.get<CLIInfo[]>('/api/cli/status'),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch supported CLIs
  const { data: supportedCLIs } = useQuery({
    queryKey: ['supported-clis'],
    queryFn: () => api.get<any[]>('/api/cli/supported'),
  });

  // Check CLI availability mutation
  const checkCLIMutation = useMutation({
    mutationFn: (cliName: string) => api.post(`/api/cli/${cliName}/check`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cli-status'] });
    },
  });

  const getStatusIcon = (cli: CLIInfo) => {
    if (!cli.health) {
      return <AlertCircle className='w-5 h-5 text-gray-400' />;
    }

    switch (cli.health.status) {
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

  const getStatusBadge = (status: string) => {
    const statusClasses = {
      healthy: 'bg-green-100 text-green-800',
      degraded: 'bg-yellow-100 text-yellow-800',
      unhealthy: 'bg-red-100 text-red-800',
      unknown: 'bg-gray-100 text-gray-800',
    };

    return (
      <span
        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[status as keyof typeof statusClasses] || statusClasses.unknown}`}
      >
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <RefreshCw className='w-8 h-8 text-gray-400 animate-spin' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='bg-red-50 border border-red-200 rounded-lg p-4'>
        <p className='text-red-700'>
          Failed to load CLI status. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex justify-between items-center'>
        <div>
          <h2 className='text-2xl font-bold text-gray-900'>CLI Management</h2>
          <p className='text-gray-600 mt-1'>
            Manage and monitor command-line interfaces
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className='flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors'
        >
          <RefreshCw className='w-4 h-4' />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className='border-b border-gray-200'>
        <nav className='-mb-px flex space-x-8'>
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className='flex items-center gap-2'>
              <Terminal className='w-4 h-4' />
              Overview
            </div>
          </button>
          <button
            onClick={() => setActiveTab('health')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'health'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className='flex items-center gap-2'>
              <Activity className='w-4 h-4' />
              Health Monitoring
            </div>
          </button>
          <button
            onClick={() => setActiveTab('install')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'install'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className='flex items-center gap-2'>
              <Download className='w-4 h-4' />
              Installation
            </div>
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'config'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className='flex items-center gap-2'>
              <Settings className='w-4 h-4' />
              Configuration
            </div>
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className='grid gap-6'>
          {/* Summary Cards */}
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            <div className='bg-white p-6 rounded-lg border border-gray-200'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-gray-600'>Total CLIs</p>
                  <p className='text-2xl font-bold text-gray-900'>
                    {(cliStatus as any)?.length || 0}
                  </p>
                </div>
                <Terminal className='w-8 h-8 text-gray-400' />
              </div>
            </div>
            <div className='bg-white p-6 rounded-lg border border-gray-200'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-gray-600'>Healthy</p>
                  <p className='text-2xl font-bold text-green-600'>
                    {(cliStatus as any)?.filter(
                      (cli: any) => cli.health?.status === 'healthy'
                    ).length || 0}
                  </p>
                </div>
                <CheckCircle className='w-8 h-8 text-green-400' />
              </div>
            </div>
            <div className='bg-white p-6 rounded-lg border border-gray-200'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-gray-600'>Issues</p>
                  <p className='text-2xl font-bold text-red-600'>
                    {(cliStatus as any)?.filter(
                      (cli: any) => cli.health?.status === 'unhealthy'
                    ).length || 0}
                  </p>
                </div>
                <XCircle className='w-8 h-8 text-red-400' />
              </div>
            </div>
            <div className='bg-white p-6 rounded-lg border border-gray-200'>
              <div className='flex items-center justify-between'>
                <div>
                  <p className='text-sm text-gray-600'>Warnings</p>
                  <p className='text-2xl font-bold text-yellow-600'>
                    {(cliStatus as any)?.filter(
                      (cli: any) => cli.health?.status === 'degraded'
                    ).length || 0}
                  </p>
                </div>
                <AlertCircle className='w-8 h-8 text-yellow-400' />
              </div>
            </div>
          </div>

          {/* CLI List */}
          <div className='bg-white rounded-lg border border-gray-200'>
            <div className='px-6 py-4 border-b border-gray-200'>
              <h3 className='text-lg font-semibold text-gray-900'>
                Installed CLIs
              </h3>
            </div>
            <div className='divide-y divide-gray-200'>
              {(cliStatus as any)?.map((cli: any) => (
                <div
                  key={cli.name}
                  className='px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors'
                  onClick={() => setSelectedCLI(cli.name)}
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-4'>
                      {getStatusIcon(cli)}
                      <div>
                        <h4 className='text-sm font-medium text-gray-900'>
                          {cli.name}
                        </h4>
                        <p className='text-sm text-gray-500'>
                          {cli.version || 'Version unknown'} • {cli.command}
                        </p>
                      </div>
                    </div>
                    <div className='flex items-center gap-4'>
                      {cli.health && getStatusBadge(cli.health.status)}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          checkCLIMutation.mutate(cli.name);
                        }}
                        className='text-sm text-blue-600 hover:text-blue-700'
                      >
                        Check Now
                      </button>
                    </div>
                  </div>
                  {cli.health && cli.health.errorCount > 0 && (
                    <div className='mt-2 text-sm text-red-600'>
                      {cli.health.errorCount} error
                      {cli.health.errorCount > 1 ? 's' : ''} detected
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'health' && (
        <CLIHealthStatus
          selectedCLI={selectedCLI}
          onSelectCLI={setSelectedCLI}
        />
      )}

      {activeTab === 'install' && (
        <CLIInstaller
          supportedCLIs={(supportedCLIs as any) || []}
          installedCLIs={(cliStatus as any) || []}
        />
      )}

      {activeTab === 'config' && (
        <CLIConfiguration
          selectedCLI={selectedCLI}
          onSelectCLI={setSelectedCLI}
        />
      )}
    </div>
  );
};

export default CLIManager;
