import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SessionStatus } from './SessionStatus';
import { SessionManager } from './SessionManager';
import { useSessionStore } from '../stores/sessionStore';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { sessionId, showSessionManager, closeSessionManager, setSessionId } =
    useSessionStore();

  return (
    <div className='h-full flex flex-col'>
      <header className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center h-16'>
            <div className='flex items-center space-x-4'>
              <Link to='/' className='text-xl font-bold text-blue-600'>
                Vibe Code
              </Link>
              <SessionStatus />
            </div>
            <nav className='flex space-x-4'>
              <Link
                to='/'
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Projects
              </Link>
              <Link
                to='/monitor'
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/monitor'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Monitor
              </Link>
              <Link
                to='/cli'
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/cli'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                CLI Tools
              </Link>
              <Link
                to='/connect'
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/connect'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Connect Local
              </Link>
              <Link
                to='/chat'
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/chat'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Chat
              </Link>
              <Link
                to='/setup'
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/setup'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Setup
              </Link>
              <Link
                to='/settings'
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  location.pathname === '/settings'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main className='flex-1 overflow-hidden'>{children}</main>

      {/* Session Manager Modal */}
      <SessionManager
        isOpen={showSessionManager}
        onClose={closeSessionManager}
        onSessionChange={setSessionId}
      />
    </div>
  );
}
