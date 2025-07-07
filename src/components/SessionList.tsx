import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Session {
  id: string
  agent_id: string
  agent_name: string
  start_time: string
  status: string
  task_count: number
}

export function SessionList() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
    const interval = setInterval(loadSessions, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  async function loadSessions() {
    try {
      const sessionList = await invoke<Session[]>('get_sessions')
      setSessions(sessionList)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return <div className="p-4">Loading sessions...</div>
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Active Sessions</h2>
      <div className="space-y-4">
        {sessions.length === 0 ? (
          <p className="text-gray-500">No active sessions</p>
        ) : (
          sessions.map((session) => (
            <div key={session.id} className="border rounded-lg p-4 hover:bg-gray-50">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">{session.agent_name}</h3>
                  <p className="text-sm text-gray-600">
                    Started: {new Date(session.start_time).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    Tasks: {session.task_count}
                  </p>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    session.status === 'active' 
                      ? 'bg-blue-100 text-blue-800' 
                      : session.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {session.status}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}