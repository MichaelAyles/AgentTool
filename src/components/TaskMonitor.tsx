import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Task {
  id: string
  session_id: string
  description: string
  status: string
  progress: number
  created_at: string
  updated_at: string
}

export function TaskMonitor() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, 2000) // Refresh every 2 seconds
    return () => clearInterval(interval)
  }, [])

  async function loadTasks() {
    try {
      const taskList = await invoke<Task[]>('get_active_tasks')
      setTasks(taskList)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'running': return 'bg-blue-100 text-blue-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return <div className="p-4">Loading tasks...</div>
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Task Monitor</h2>
      <div className="space-y-4">
        {tasks.length === 0 ? (
          <p className="text-gray-500">No active tasks</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="font-medium">{task.description}</p>
                  <p className="text-sm text-gray-600">
                    Created: {new Date(task.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(task.status)}`}>
                  {task.status}
                </span>
              </div>
              {task.status === 'running' && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{task.progress}% complete</p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}