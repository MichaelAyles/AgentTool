import { useState, useEffect } from 'react';

export function Settings() {
  const [rootDirectory, setRootDirectory] = useState<string>('Loading...');
  const [version, setVersion] = useState<string>('Loading...');
  const [platform, setPlatform] = useState<string>('');

  useEffect(() => {
    // Fetch system information from API
    const fetchSystemInfo = async () => {
      try {
        const response = await fetch(
          'http://localhost:3000/api/v1/system/info'
        );
        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            setRootDirectory(result.data.rootDirectory);
            setVersion(result.data.version);
            setPlatform(result.data.platform);
          }
        }
      } catch (error) {
        console.error('Failed to fetch system info:', error);
        // Fallback values
        setRootDirectory('/Users/tribune/Desktop/AgentTool');
        setVersion('1.0.0');
        setPlatform('darwin');
      }
    };

    fetchSystemInfo();
  }, []);

  return (
    <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
      <h1 className='text-2xl font-bold text-gray-900 dark:text-white mb-8'>
        Settings
      </h1>

      <div className='space-y-8'>
        <section>
          <h2 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
            Desktop Connector Information
          </h2>
          <div className='bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700'>
            <div className='space-y-4'>
              <div>
                <label className='block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300'>
                  Root Directory Location
                </label>
                <div className='bg-gray-50 dark:bg-gray-700 p-3 rounded-md border'>
                  <code className='text-sm text-gray-800 dark:text-gray-200 font-mono'>
                    {rootDirectory}
                  </code>
                </div>
              </div>
              <div>
                <label className='block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300'>
                  Version
                </label>
                <div className='bg-gray-50 dark:bg-gray-700 p-3 rounded-md border'>
                  <code className='text-sm text-gray-800 dark:text-gray-200 font-mono'>
                    v{version}
                  </code>
                </div>
              </div>
              <div>
                <label className='block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300'>
                  Platform
                </label>
                <div className='bg-gray-50 dark:bg-gray-700 p-3 rounded-md border'>
                  <code className='text-sm text-gray-800 dark:text-gray-200 font-mono'>
                    {platform}
                  </code>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
            General
          </h2>
          <div className='bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700'>
            <div className='space-y-4'>
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Default Adapter
                </label>
                <select className='input w-full max-w-xs'>
                  <option value='claude-code'>Claude Code</option>
                  <option value='gemini-cli'>Gemini CLI</option>
                  <option value='custom'>Custom Script</option>
                </select>
              </div>
              <div>
                <label className='flex items-center'>
                  <input type='checkbox' className='mr-2' />
                  <span className='text-sm'>Enable dangerous mode</span>
                </label>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
            Terminal
          </h2>
          <div className='bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700'>
            <div className='space-y-4'>
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Font Size
                </label>
                <input
                  type='number'
                  min='10'
                  max='24'
                  defaultValue='14'
                  className='input w-24'
                />
              </div>
              <div>
                <label className='block text-sm font-medium mb-2'>
                  Font Family
                </label>
                <select className='input w-full max-w-xs'>
                  <option value='JetBrains Mono'>JetBrains Mono</option>
                  <option value='Fira Code'>Fira Code</option>
                  <option value='Monaco'>Monaco</option>
                  <option value='Consolas'>Consolas</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
            Adapters
          </h2>
          <div className='bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700'>
            <div className='space-y-4'>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='font-medium'>Claude Code</div>
                  <div className='text-sm text-gray-500'>Version 1.0.0</div>
                </div>
                <label className='flex items-center'>
                  <input type='checkbox' defaultChecked className='mr-2' />
                  <span className='text-sm'>Enabled</span>
                </label>
              </div>
              <div className='flex items-center justify-between'>
                <div>
                  <div className='font-medium'>Gemini CLI</div>
                  <div className='text-sm text-gray-500'>Version 1.0.0</div>
                </div>
                <label className='flex items-center'>
                  <input type='checkbox' defaultChecked className='mr-2' />
                  <span className='text-sm'>Enabled</span>
                </label>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
