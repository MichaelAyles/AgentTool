import { useState } from 'react'
import './App.css'
import { AgentList } from './components/AgentList'
import { SessionList } from './components/SessionList'
import { TaskMonitor } from './components/TaskMonitor'
import { CommandInput } from './components/CommandInput'

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agents' | 'sessions' | 'tasks'>('dashboard')

  function refreshData() {
    // This will trigger a refresh in child components if needed
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800">
              🤖 AgentTool
            </h1>
            <p className="text-sm text-gray-600">
              Hierarchical Multi-Agent System for AI-Powered Development
            </p>
          </div>
        </div>
      </header>

      <nav className="bg-white border-b">
        <div className="container mx-auto px-6">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('agents')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'agents'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Agents
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'sessions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Sessions
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`py-4 px-2 border-b-2 font-medium text-sm ${
                activeTab === 'tasks'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Tasks
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            <CommandInput onCommandSent={refreshData} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <SessionList />
              <TaskMonitor />
            </div>
          </div>
        )}

        {activeTab === 'agents' && <AgentList />}
        {activeTab === 'sessions' && <SessionList />}
        {activeTab === 'tasks' && <TaskMonitor />}
      </main>
    </div>
  )
}

export default App