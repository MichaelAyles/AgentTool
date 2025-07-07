import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface CommandInputProps {
  onCommandSent?: () => void
}

export function CommandInput({ onCommandSent }: CommandInputProps) {
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)

  async function sendCommand() {
    if (!command.trim()) return

    setLoading(true)
    setResponse(null)

    try {
      const result = await invoke<string>('send_command_to_middle_manager', { 
        command: command.trim() 
      })
      setResponse(result)
      setCommand('')
      onCommandSent?.()
    } catch (error) {
      setResponse(`Error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendCommand()
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-4">Command Center</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="command" className="block text-sm font-medium text-gray-700 mb-2">
            Send command to Middle Manager
          </label>
          <textarea
            id="command"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Enter your task or command..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !command.trim()}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          {loading ? 'Processing...' : 'Send Command'}
        </button>
      </form>

      {response && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg">
          <h3 className="font-semibold mb-2">Response:</h3>
          <pre className="whitespace-pre-wrap text-sm">{response}</pre>
        </div>
      )}
    </div>
  )
}