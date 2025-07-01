import React, { useState } from 'react';
import { useMutation, useQueryClient } from 'react-query';
import {
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Package,
  Terminal,
  Info,
  Loader,
  ChevronRight,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { api } from '../../services/api';

interface CLIInstallerProps {
  supportedCLIs: any[];
  installedCLIs: any[];
}

interface InstallationStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  message?: string;
}

const CLIInstaller: React.FC<CLIInstallerProps> = ({
  supportedCLIs,
  installedCLIs,
}) => {
  const [selectedCLI, setSelectedCLI] = useState<string | null>(null);
  const [installationSteps, setInstallationSteps] = useState<
    InstallationStep[]
  >([]);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const queryClient = useQueryClient();

  // Install CLI mutation
  const installCLIMutation = useMutation(
    ({ cliName, options }: { cliName: string; options?: any }) =>
      api.post(`/api/cli/${cliName}/install`, options),
    {
      onMutate: ({ cliName }) => {
        setInstallationSteps([
          {
            id: 'check',
            name: 'Checking system requirements',
            status: 'running',
          },
          { id: 'download', name: 'Downloading CLI', status: 'pending' },
          { id: 'install', name: 'Installing dependencies', status: 'pending' },
          { id: 'verify', name: 'Verifying installation', status: 'pending' },
        ]);
      },
      onSuccess: (data, { cliName }) => {
        setInstallationSteps(prev =>
          prev.map(step => ({ ...step, status: 'success' }))
        );
        queryClient.invalidateQueries('cli-status');
        queryClient.invalidateQueries('supported-clis');
      },
      onError: (error: any, { cliName }) => {
        const errorStep = installationSteps.find(s => s.status === 'running');
        if (errorStep) {
          setInstallationSteps(prev =>
            prev.map(step =>
              step.id === errorStep.id
                ? { ...step, status: 'failed', message: error.message }
                : step
            )
          );
        }
      },
    }
  );

  // Check CLI availability
  const checkCLIMutation = useMutation(
    (cliName: string) => api.get(`/api/cli/${cliName}/check`),
    {
      onSuccess: data => {
        console.log('CLI check result:', data);
      },
    }
  );

  // Diagnose installation issues
  const diagnoseMutation = useMutation(
    (cliName: string) => api.get(`/api/cli/${cliName}/diagnose`),
    {
      onSuccess: data => {
        console.log('Diagnosis result:', data);
      },
    }
  );

  const isInstalled = (cliName: string) => {
    return installedCLIs?.some(cli => cli.name === cliName && cli.available);
  };

  const getInstallStatus = (cliName: string) => {
    const installed = installedCLIs?.find(cli => cli.name === cliName);
    if (!installed) return 'not-checked';
    if (installed.available) return 'installed';
    return 'not-installed';
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'linux':
        return '🐧';
      case 'darwin':
        return '🍎';
      case 'win32':
        return '🪟';
      default:
        return '💻';
    }
  };

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
        {/* CLI List */}
        <div className='lg:col-span-2'>
          <div className='bg-white rounded-lg border border-gray-200'>
            <div className='px-6 py-4 border-b border-gray-200'>
              <h3 className='text-lg font-semibold text-gray-900'>
                Available CLIs
              </h3>
              <p className='text-sm text-gray-600 mt-1'>
                Select a CLI to install or check its status
              </p>
            </div>
            <div className='divide-y divide-gray-200'>
              {supportedCLIs?.map(cli => {
                const status = getInstallStatus(cli.name);
                const cliInfo = cli.info;

                return (
                  <div
                    key={cli.name}
                    className={`px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedCLI === cli.name ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => setSelectedCLI(cli.name)}
                  >
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center gap-4'>
                        <div className='w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center'>
                          <Terminal className='w-6 h-6 text-gray-600' />
                        </div>
                        <div>
                          <h4 className='text-sm font-medium text-gray-900'>
                            {cliInfo.name}
                          </h4>
                          <p className='text-sm text-gray-500'>
                            Command:{' '}
                            <code className='px-1 bg-gray-100 rounded'>
                              {cliInfo.command}
                            </code>
                          </p>
                          <div className='flex items-center gap-2 mt-1'>
                            {cliInfo.platformSupport && (
                              <>
                                {cliInfo.platformSupport.linux && (
                                  <span className='text-xs' title='Linux'>
                                    🐧
                                  </span>
                                )}
                                {cliInfo.platformSupport.darwin && (
                                  <span className='text-xs' title='macOS'>
                                    🍎
                                  </span>
                                )}
                                {cliInfo.platformSupport.win32 && (
                                  <span className='text-xs' title='Windows'>
                                    🪟
                                  </span>
                                )}
                              </>
                            )}
                            <span className='text-xs text-gray-500'>
                              Install via {cliInfo.installMethod}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className='flex items-center gap-3'>
                        {status === 'installed' && (
                          <span className='flex items-center gap-1 text-green-600'>
                            <CheckCircle className='w-4 h-4' />
                            <span className='text-sm'>Installed</span>
                          </span>
                        )}
                        <ChevronRight className='w-5 h-5 text-gray-400' />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Installation Panel */}
        <div>
          {selectedCLI ? (
            <div className='bg-white rounded-lg border border-gray-200 p-6'>
              <h3 className='text-lg font-semibold text-gray-900 mb-4'>
                {supportedCLIs?.find(c => c.name === selectedCLI)?.info.name}
              </h3>

              {/* Installation Status */}
              {installationSteps.length > 0 && (
                <div className='mb-6'>
                  <h4 className='text-sm font-medium text-gray-700 mb-3'>
                    Installation Progress
                  </h4>
                  <div className='space-y-2'>
                    {installationSteps.map(step => (
                      <div key={step.id} className='flex items-center gap-3'>
                        {step.status === 'pending' && (
                          <div className='w-5 h-5 rounded-full border-2 border-gray-300' />
                        )}
                        {step.status === 'running' && (
                          <Loader className='w-5 h-5 text-blue-600 animate-spin' />
                        )}
                        {step.status === 'success' && (
                          <CheckCircle className='w-5 h-5 text-green-500' />
                        )}
                        {step.status === 'failed' && (
                          <XCircle className='w-5 h-5 text-red-500' />
                        )}
                        <div className='flex-1'>
                          <p className='text-sm text-gray-900'>{step.name}</p>
                          {step.message && (
                            <p className='text-xs text-red-600'>
                              {step.message}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CLI Information */}
              <div className='space-y-4 mb-6'>
                <div>
                  <h4 className='text-sm font-medium text-gray-700 mb-2'>
                    Installation Command
                  </h4>
                  <code className='block p-3 bg-gray-900 text-gray-100 rounded text-sm'>
                    {
                      supportedCLIs?.find(c => c.name === selectedCLI)?.info
                        .installCommand
                    }
                  </code>
                </div>

                {/* Dependencies */}
                {supportedCLIs?.find(c => c.name === selectedCLI)?.info
                  .dependencies && (
                  <div>
                    <h4 className='text-sm font-medium text-gray-700 mb-2'>
                      Dependencies
                    </h4>
                    <ul className='space-y-1'>
                      {supportedCLIs
                        .find(c => c.name === selectedCLI)
                        ?.info.dependencies.map((dep: string) => (
                          <li
                            key={dep}
                            className='text-sm text-gray-600 flex items-center gap-2'
                          >
                            <Package className='w-4 h-4' />
                            {dep}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                {/* Advanced Options */}
                <div>
                  <button
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    className='text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1'
                  >
                    <Shield className='w-4 h-4' />
                    Advanced Options
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        showAdvancedOptions ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                  {showAdvancedOptions && (
                    <div className='mt-3 p-3 bg-gray-50 rounded-lg space-y-2'>
                      <label className='flex items-center gap-2'>
                        <input type='checkbox' className='rounded' />
                        <span className='text-sm text-gray-700'>
                          Use fallback installation method
                        </span>
                      </label>
                      <label className='flex items-center gap-2'>
                        <input type='checkbox' className='rounded' />
                        <span className='text-sm text-gray-700'>
                          Skip verification
                        </span>
                      </label>
                      <label className='flex items-center gap-2'>
                        <input
                          type='checkbox'
                          className='rounded'
                          defaultChecked
                        />
                        <span className='text-sm text-gray-700'>
                          Auto-detect platform
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className='space-y-2'>
                {getInstallStatus(selectedCLI) === 'installed' ? (
                  <>
                    <button
                      onClick={() => checkCLIMutation.mutate(selectedCLI)}
                      className='w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors'
                    >
                      <RefreshCw className='w-4 h-4' />
                      Verify Installation
                    </button>
                    <button
                      onClick={() => diagnoseMutation.mutate(selectedCLI)}
                      className='w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors'
                    >
                      <Info className='w-4 h-4' />
                      Run Diagnostics
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() =>
                        installCLIMutation.mutate({ cliName: selectedCLI })
                      }
                      disabled={installCLIMutation.isLoading}
                      className='w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50'
                    >
                      {installCLIMutation.isLoading ? (
                        <Loader className='w-4 h-4 animate-spin' />
                      ) : (
                        <Download className='w-4 h-4' />
                      )}
                      Install CLI
                    </button>
                    <button
                      onClick={() => checkCLIMutation.mutate(selectedCLI)}
                      className='w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors'
                    >
                      <AlertCircle className='w-4 h-4' />
                      Check Availability
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className='bg-gray-50 rounded-lg border border-gray-200 p-6 text-center'>
              <Terminal className='w-12 h-12 text-gray-400 mx-auto mb-3' />
              <p className='text-gray-600'>
                Select a CLI to view installation options
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CLIInstaller;
