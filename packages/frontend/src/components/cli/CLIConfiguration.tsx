import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Save,
  RefreshCw,
  Shield,
  Clock,
  AlertCircle,
  Info,
  Edit3,
  FileText,
  Sliders,
} from 'lucide-react';
import { api } from '../../services/api';
import Editor from '@monaco-editor/react';

interface CLIConfigurationProps {
  selectedCLI: string | null;
  onSelectCLI: (cli: string) => void;
}

interface MonitoringConfig {
  checkInterval: number;
  timeout: number;
  retryAttempts: number;
  enablePerformanceMonitoring: boolean;
  enableDeepHealthChecks: boolean;
  alertThresholds: {
    responseTime: number;
    errorRate: number;
    consecutiveFailures: number;
  };
}

const CLIConfiguration: React.FC<CLIConfigurationProps> = ({
  selectedCLI,
  onSelectCLI,
}) => {
  const [activeTab, setActiveTab] = useState<'monitoring' | 'adapter'>(
    'monitoring'
  );
  const [monitoringConfig, setMonitoringConfig] =
    useState<MonitoringConfig | null>(null);
  const [adapterConfig, setAdapterConfig] = useState<string>('{}');
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();

  // Fetch monitoring configuration
  const { data: config, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['cli-monitoring-config'],
    queryFn: () => api.get<MonitoringConfig>('/api/cli-health/config'),
  });

  // Fetch adapter configuration if a CLI is selected
  const { data: adapterConfigData, isLoading: isLoadingAdapter } = useQuery({
    queryKey: ['adapter-config', selectedCLI],
    queryFn: () => api.get(`/api/adapter-config/${selectedCLI}`),
    enabled: !!selectedCLI && activeTab === 'adapter',
  });

  // Update monitoring configuration
  const updateMonitoringConfigMutation = useMutation({
    mutationFn: (newConfig: Partial<MonitoringConfig>) =>
      api.put('/api/cli-health/config', newConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cli-monitoring-config'] });
      setIsEditing(false);
    },
  });

  // Update adapter configuration
  const updateAdapterConfigMutation = useMutation({
    mutationFn: ({ adapterId, config }: { adapterId: string; config: any }) =>
      api.put(`/api/adapter-config/${adapterId}`, { configuration: config }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['adapter-config', selectedCLI],
      });
      setIsEditing(false);
    },
  });

  useEffect(() => {
    if (config) {
      setMonitoringConfig(config as MonitoringConfig);
    }
  }, [config]);

  useEffect(() => {
    if ((adapterConfigData as any)?.configuration) {
      setAdapterConfig(
        JSON.stringify((adapterConfigData as any).configuration, null, 2)
      );
    }
  }, [adapterConfigData]);

  const handleMonitoringConfigChange = (field: string, value: any) => {
    if (!monitoringConfig) return;

    const newConfig = { ...monitoringConfig };
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      (newConfig as any)[parent][child] = value;
    } else {
      (newConfig as any)[field] = value;
    }
    setMonitoringConfig(newConfig);
  };

  const saveMonitoringConfig = () => {
    if (monitoringConfig) {
      updateMonitoringConfigMutation.mutate(monitoringConfig);
    }
  };

  const saveAdapterConfig = () => {
    if (selectedCLI) {
      try {
        const parsedConfig = JSON.parse(adapterConfig);
        updateAdapterConfigMutation.mutate({
          adapterId: selectedCLI,
          config: parsedConfig,
        });
      } catch (error) {
        console.error('Invalid JSON configuration');
      }
    }
  };

  const resetToDefaults = () => {
    setMonitoringConfig({
      checkInterval: 30000,
      timeout: 10000,
      retryAttempts: 3,
      enablePerformanceMonitoring: true,
      enableDeepHealthChecks: true,
      alertThresholds: {
        responseTime: 5000,
        errorRate: 0.1,
        consecutiveFailures: 3,
      },
    });
  };

  return (
    <div className='space-y-6'>
      {/* Configuration Tabs */}
      <div className='bg-white rounded-lg border border-gray-200'>
        <div className='border-b border-gray-200'>
          <nav className='-mb-px flex'>
            <button
              onClick={() => setActiveTab('monitoring')}
              className={`py-3 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'monitoring'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className='flex items-center gap-2'>
                <Sliders className='w-4 h-4' />
                Monitoring Settings
              </div>
            </button>
            <button
              onClick={() => setActiveTab('adapter')}
              className={`py-3 px-6 text-sm font-medium border-b-2 ${
                activeTab === 'adapter'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className='flex items-center gap-2'>
                <Settings className='w-4 h-4' />
                Adapter Configuration
              </div>
            </button>
          </nav>
        </div>

        <div className='p-6'>
          {activeTab === 'monitoring' && (
            <div className='space-y-6'>
              <div className='flex justify-between items-center'>
                <div>
                  <h3 className='text-lg font-semibold text-gray-900'>
                    Health Monitoring Settings
                  </h3>
                  <p className='text-sm text-gray-600 mt-1'>
                    Configure how CLI health is monitored across the system
                  </p>
                </div>
                <div className='flex gap-2'>
                  <button
                    onClick={resetToDefaults}
                    className='px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50'
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className='px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50'
                  >
                    <Edit3 className='w-4 h-4' />
                  </button>
                </div>
              </div>

              {monitoringConfig && (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  {/* Check Settings */}
                  <div className='space-y-4'>
                    <h4 className='text-sm font-medium text-gray-700 flex items-center gap-2'>
                      <Clock className='w-4 h-4' />
                      Check Settings
                    </h4>

                    <div>
                      <label className='block text-sm text-gray-600 mb-1'>
                        Check Interval (seconds)
                      </label>
                      <input
                        type='number'
                        value={monitoringConfig.checkInterval / 1000}
                        onChange={e =>
                          handleMonitoringConfigChange(
                            'checkInterval',
                            parseInt(e.target.value) * 1000
                          )
                        }
                        disabled={!isEditing}
                        className='w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50'
                      />
                      <p className='text-xs text-gray-500 mt-1'>
                        How often to check CLI health status
                      </p>
                    </div>

                    <div>
                      <label className='block text-sm text-gray-600 mb-1'>
                        Timeout (seconds)
                      </label>
                      <input
                        type='number'
                        value={monitoringConfig.timeout / 1000}
                        onChange={e =>
                          handleMonitoringConfigChange(
                            'timeout',
                            parseInt(e.target.value) * 1000
                          )
                        }
                        disabled={!isEditing}
                        className='w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50'
                      />
                    </div>

                    <div>
                      <label className='block text-sm text-gray-600 mb-1'>
                        Retry Attempts
                      </label>
                      <input
                        type='number'
                        value={monitoringConfig.retryAttempts}
                        onChange={e =>
                          handleMonitoringConfigChange(
                            'retryAttempts',
                            parseInt(e.target.value)
                          )
                        }
                        disabled={!isEditing}
                        className='w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50'
                      />
                    </div>
                  </div>

                  {/* Feature Toggles */}
                  <div className='space-y-4'>
                    <h4 className='text-sm font-medium text-gray-700 flex items-center gap-2'>
                      <Shield className='w-4 h-4' />
                      Features
                    </h4>

                    <label className='flex items-center gap-3'>
                      <input
                        type='checkbox'
                        checked={monitoringConfig.enablePerformanceMonitoring}
                        onChange={e =>
                          handleMonitoringConfigChange(
                            'enablePerformanceMonitoring',
                            e.target.checked
                          )
                        }
                        disabled={!isEditing}
                        className='rounded'
                      />
                      <div>
                        <span className='text-sm font-medium text-gray-700'>
                          Performance Monitoring
                        </span>
                        <p className='text-xs text-gray-500'>
                          Track response times and success rates
                        </p>
                      </div>
                    </label>

                    <label className='flex items-center gap-3'>
                      <input
                        type='checkbox'
                        checked={monitoringConfig.enableDeepHealthChecks}
                        onChange={e =>
                          handleMonitoringConfigChange(
                            'enableDeepHealthChecks',
                            e.target.checked
                          )
                        }
                        disabled={!isEditing}
                        className='rounded'
                      />
                      <div>
                        <span className='text-sm font-medium text-gray-700'>
                          Deep Health Checks
                        </span>
                        <p className='text-xs text-gray-500'>
                          Check dependencies and configurations
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Alert Thresholds */}
                  <div className='space-y-4 md:col-span-2'>
                    <h4 className='text-sm font-medium text-gray-700 flex items-center gap-2'>
                      <AlertCircle className='w-4 h-4' />
                      Alert Thresholds
                    </h4>

                    <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                      <div>
                        <label className='block text-sm text-gray-600 mb-1'>
                          Response Time (ms)
                        </label>
                        <input
                          type='number'
                          value={monitoringConfig.alertThresholds.responseTime}
                          onChange={e =>
                            handleMonitoringConfigChange(
                              'alertThresholds.responseTime',
                              parseInt(e.target.value)
                            )
                          }
                          disabled={!isEditing}
                          className='w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50'
                        />
                      </div>

                      <div>
                        <label className='block text-sm text-gray-600 mb-1'>
                          Error Rate (%)
                        </label>
                        <input
                          type='number'
                          value={
                            monitoringConfig.alertThresholds.errorRate * 100
                          }
                          onChange={e =>
                            handleMonitoringConfigChange(
                              'alertThresholds.errorRate',
                              parseFloat(e.target.value) / 100
                            )
                          }
                          disabled={!isEditing}
                          className='w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50'
                        />
                      </div>

                      <div>
                        <label className='block text-sm text-gray-600 mb-1'>
                          Consecutive Failures
                        </label>
                        <input
                          type='number'
                          value={
                            monitoringConfig.alertThresholds.consecutiveFailures
                          }
                          onChange={e =>
                            handleMonitoringConfigChange(
                              'alertThresholds.consecutiveFailures',
                              parseInt(e.target.value)
                            )
                          }
                          disabled={!isEditing}
                          className='w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-50'
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isEditing && (
                <div className='flex justify-end gap-2 pt-4 border-t'>
                  <button
                    onClick={() => setIsEditing(false)}
                    className='px-4 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50'
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveMonitoringConfig}
                    disabled={updateMonitoringConfigMutation.isPending}
                    className='px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
                  >
                    {updateMonitoringConfigMutation.isPending ? (
                      <RefreshCw className='w-4 h-4 animate-spin' />
                    ) : (
                      <>
                        <Save className='w-4 h-4 inline mr-1' />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'adapter' && (
            <div className='space-y-6'>
              {selectedCLI ? (
                <>
                  <div className='flex justify-between items-center'>
                    <div>
                      <h3 className='text-lg font-semibold text-gray-900'>
                        {selectedCLI} Configuration
                      </h3>
                      <p className='text-sm text-gray-600 mt-1'>
                        Customize adapter-specific settings
                      </p>
                    </div>
                    <button
                      onClick={() => setIsEditing(!isEditing)}
                      className='px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50'
                    >
                      <Edit3 className='w-4 h-4' />
                    </button>
                  </div>

                  <div className='border border-gray-200 rounded-lg overflow-hidden'>
                    <Editor
                      height='400px'
                      language='json'
                      theme='vs-light'
                      value={adapterConfig}
                      onChange={value => setAdapterConfig(value || '{}')}
                      options={{
                        readOnly: !isEditing,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                      }}
                    />
                  </div>

                  {isEditing && (
                    <div className='flex justify-end gap-2'>
                      <button
                        onClick={() => setIsEditing(false)}
                        className='px-4 py-2 text-sm bg-white border border-gray-300 rounded-md hover:bg-gray-50'
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveAdapterConfig}
                        disabled={updateAdapterConfigMutation.isPending}
                        className='px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
                      >
                        {updateAdapterConfigMutation.isPending ? (
                          <RefreshCw className='w-4 h-4 animate-spin' />
                        ) : (
                          <>
                            <Save className='w-4 h-4 inline mr-1' />
                            Save Configuration
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className='text-center py-12'>
                  <FileText className='w-12 h-12 text-gray-400 mx-auto mb-3' />
                  <p className='text-gray-600'>
                    Select a CLI from the overview tab to configure its adapter
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CLIConfiguration;
