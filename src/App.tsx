import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import './App.css'

function App() {
  const [greetMsg, setGreetMsg] = useState('')
  const [name, setName] = useState('')

  async function greet() {
    setGreetMsg(await invoke('greet', { name }))
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-4xl font-bold text-center mb-8">
        🤖 AgentTool
      </h1>
      
      <p className="text-xl text-center mb-8 text-gray-600">
        Hierarchical Multi-Agent System for AI-Powered Development
      </p>

      <div className="max-w-md mx-auto">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            greet()
          }}
        >
          <input
            id="greet-input"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter a name..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button 
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Greet
          </button>
        </form>

        {greetMsg && (
          <p className="mt-4 p-4 bg-green-100 text-green-800 rounded-lg">
            {greetMsg}
          </p>
        )}
      </div>

      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">🎯 Middle Manager</h3>
          <p className="text-gray-600">Intelligent task coordination and agent management</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">🔒 Secure Isolation</h3>
          <p className="text-gray-600">Process isolation and git worktree separation</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">⚡ Real-time</h3>
          <p className="text-gray-600">Live agent monitoring and coordination</p>
        </div>
      </div>
    </div>
  )
}

export default App