export function Settings() {
  return (
    <div className='max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8'>
      <h1 className='text-2xl font-bold text-gray-900 dark:text-white mb-8'>
        Settings
      </h1>

      <div className='space-y-8'>
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
