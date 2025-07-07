import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Agent {
  id: string
  name: string
  type: string
  status: string
  capabilities: string[]
}

export function AgentList() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAgents()
  }, [])

  async function loadAgents() {
    try {
      const agentList = await invoke<Agent[]>('get_agents')
      setAgents(agentList)
    } catch (error) {
      console.error('Failed to load agents:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-4">Loading agents...</div>
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Available Agents</h2>
      <div className="space-y-4">
        {agents.length === 0 ? (
          <p className="text-gray-500">No agents registered</p>
        ) : (
          agents.map((agent) => (
            <div key={agent.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-lg">{agent.name}</h3>
                  <p className="text-sm text-gray-600">{agent.type}</p>
                </div>
                <div className="text-right">
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    agent.status === 'available' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {agent.status}
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Capabilities: {agent.capabilities.join(', ')}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}