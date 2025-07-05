import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, Download, Terminal, GitBranch } from 'lucide-react'

const InstallSection: React.FC = () => {
  const [copied, setCopied] = useState(false)
  
  const installScript = `curl -fsSL https://raw.githubusercontent.com/MichaelAyles/AgentTool/main/setup.sh | bash`
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installScript)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  return (
    <section className="py-24 px-4" id="install">
      <div className="max-w-4xl mx-auto text-center">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-gradient bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
              Get Started
            </span>
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Install AgentTool with a single command. The setup script will handle 
            all dependencies and configuration automatically.
          </p>
        </motion.div>

        {/* Install command box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          viewport={{ once: true }}
          className="mb-12"
        >
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6">
              {/* Terminal header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Terminal className="text-green-400" size={20} />
                  <span className="text-gray-400 font-mono text-sm">bash</span>
                </div>
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              </div>
              
              {/* Command */}
              <div className="flex items-center justify-between bg-black/50 rounded-lg p-4">
                <code className="text-green-400 font-mono text-sm md:text-base flex-1 text-left">
                  {installScript}
                </code>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCopy}
                  className="ml-4 p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center space-x-2"
                >
                  {copied ? (
                    <>
                      <Check size={16} />
                      <span className="text-sm font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      <span className="text-sm font-medium">Copy</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Installation steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16"
        >
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center">
              <Download className="text-white" size={24} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">1. Download</h3>
            <p className="text-gray-400">The script automatically downloads the latest release</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <Terminal className="text-white" size={24} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">2. Install</h3>
            <p className="text-gray-400">Sets up dependencies and configures the environment</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
              <GitBranch className="text-white" size={24} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">3. Launch</h3>
            <p className="text-gray-400">AgentTool is ready to orchestrate your AI agents</p>
          </div>
        </motion.div>

        {/* Requirements */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <h3 className="text-xl font-semibold text-white mb-4">Requirements</h3>
          <div className="inline-block bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div>
                <div className="text-blue-400 font-medium mb-1">Operating System</div>
                <div className="text-gray-400">macOS, Linux, Windows (WSL)</div>
              </div>
              <div>
                <div className="text-purple-400 font-medium mb-1">Dependencies</div>
                <div className="text-gray-400">Git, Node.js, Rust (auto-installed)</div>
              </div>
              <div>
                <div className="text-green-400 font-medium mb-1">AI Tools</div>
                <div className="text-gray-400">Claude Code, Gemini CLI (optional)</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Alternative install methods */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <p className="text-gray-400 mb-4">Alternative installation methods:</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a 
              href="https://github.com/MichaelAyles/AgentTool/releases" 
              className="px-6 py-3 bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg hover:border-white/40 transition-colors text-white font-medium"
            >
              Download Binary
            </a>
            <a 
              href="https://github.com/MichaelAyles/AgentTool" 
              className="px-6 py-3 bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg hover:border-white/40 transition-colors text-white font-medium"
            >
              Build from Source
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default InstallSection