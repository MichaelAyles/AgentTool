import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, GitBranch, Bot, Zap, Copy, Check, Terminal } from 'lucide-react'

const Hero: React.FC = () => {
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
    <section className="min-h-screen flex items-center justify-center px-4 relative">
      {/* Floating elements */}
      <motion.div 
        className="absolute top-20 left-10 text-blue-400/30"
        animate={{ y: [-10, 10, -10] }}
        transition={{ duration: 4, repeat: Infinity }}
      >
        <Bot size={24} />
      </motion.div>
      
      <motion.div 
        className="absolute top-32 right-16 text-purple-400/30"
        animate={{ y: [10, -10, 10] }}
        transition={{ duration: 5, repeat: Infinity }}
      >
        <GitBranch size={20} />
      </motion.div>
      
      <motion.div 
        className="absolute bottom-32 left-20 text-indigo-400/30"
        animate={{ y: [-15, 15, -15] }}
        transition={{ duration: 6, repeat: Infinity }}
      >
        <Zap size={18} />
      </motion.div>

      <div className="text-center max-w-4xl mx-auto">
        {/* Main heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-6xl md:text-8xl font-bold mb-6 leading-tight">
            <span className="text-gradient bg-gradient-to-r from-blue-400 via-purple-500 to-indigo-600 bg-clip-text text-transparent">
              Agent
            </span>
            <span className="text-white">Tool</span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed"
        >
          Hierarchical Multi-Agent System for
          <br />
          <span className="text-gradient bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent font-semibold">
            AI-Powered Development
          </span>
        </motion.p>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg text-gray-400 mb-12 max-w-2xl mx-auto"
        >
          Orchestrate Claude Code and Gemini CLI with intelligent session isolation, 
          git worktree management, and collaborative multi-agent workflows.
        </motion.p>

        {/* Key features pills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-wrap justify-center gap-3 mb-12"
        >
          {[
            'Session Isolation', 
            'Git Worktrees', 
            'Multi-Agent Coordination',
            'OpenRouter Integration'
          ].map((feature, index) => (
            <span
              key={feature}
              className="px-4 py-2 bg-white/10 backdrop-blur-lg border border-white/20 rounded-full text-sm font-medium"
            >
              {feature}
            </span>
          ))}
        </motion.div>

        {/* Install command box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mb-16 max-w-2xl mx-auto"
        >
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6">
              {/* Terminal header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Terminal className="text-green-400" size={20} />
                  <span className="text-gray-400 font-mono text-sm">Install AgentTool</span>
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

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="flex flex-col items-center"
        >
          <span className="text-gray-500 text-sm mb-4">Scroll to explore</span>
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ArrowDown className="text-gray-500" size={24} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

export default Hero