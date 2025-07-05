import React from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowRight, Bot, Brain, Code, Sparkles } from 'lucide-react'

const Architecture: React.FC = () => {
  return (
    <section className="py-24 px-4 bg-gradient-to-b from-transparent to-black/20">
      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-gradient bg-gradient-to-r from-purple-400 to-blue-600 bg-clip-text text-transparent">
              Hierarchical Architecture
            </span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            A sophisticated multi-layer system that orchestrates AI agents 
            with intelligent task decomposition and secure execution.
          </p>
        </motion.div>

        {/* Architecture diagram */}
        <div className="relative">
          {/* User Layer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-block p-6 bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-lg border border-blue-400/30 rounded-2xl">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-content-center p-3">
                <Bot className="w-full h-full text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">User Interface</h3>
              <p className="text-gray-300">React + TypeScript Desktop App</p>
            </div>
          </motion.div>

          {/* Arrow down */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
            className="flex justify-center mb-16"
          >
            <ArrowDown className="text-gray-500" size={32} />
          </motion.div>

          {/* Middle Manager Layer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-block p-8 bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur-lg border border-purple-400/30 rounded-2xl">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full flex items-center justify-center p-4">
                <Brain className="w-full h-full text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Middle Manager</h3>
              <p className="text-gray-300 mb-4">OpenRouter + Claude/Gemini Integration</p>
              <div className="text-sm text-gray-400 space-y-1">
                <div>• Task Decomposition</div>
                <div>• Agent Coordination</div>
                <div>• Result Aggregation</div>
              </div>
            </div>
          </motion.div>

          {/* Arrow down */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            viewport={{ once: true }}
            className="flex justify-center mb-16"
          >
            <ArrowDown className="text-gray-500" size={32} />
          </motion.div>

          {/* Subagents Layer */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16"
          >
            {/* Claude Code Agent */}
            <div className="text-center">
              <div className="p-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 backdrop-blur-lg border border-green-400/30 rounded-2xl">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center p-3">
                  <Code className="w-full h-full text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Claude Code Agent</h3>
                <p className="text-gray-300 text-sm mb-3">Process-isolated Claude Code execution</p>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>• File operations</div>
                  <div>• Git management</div>
                  <div>• Code analysis</div>
                </div>
              </div>
            </div>

            {/* Gemini CLI Agent */}
            <div className="text-center">
              <div className="p-6 bg-gradient-to-r from-orange-500/20 to-red-500/20 backdrop-blur-lg border border-orange-400/30 rounded-2xl">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-orange-400 to-red-500 rounded-full flex items-center justify-center p-3">
                  <Sparkles className="w-full h-full text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Gemini CLI Agent</h3>
                <p className="text-gray-300 text-sm mb-3">Secure Gemini CLI integration</p>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>• Natural language processing</div>
                  <div>• Quick task execution</div>
                  <div>• Context analysis</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Arrow down */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            viewport={{ once: true }}
            className="flex justify-center mb-16"
          >
            <ArrowDown className="text-gray-500" size={32} />
          </motion.div>

          {/* Infrastructure Layer */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <div className="inline-block p-6 bg-gradient-to-r from-gray-700/20 to-gray-500/20 backdrop-blur-lg border border-gray-400/30 rounded-2xl">
              <h3 className="text-xl font-bold text-white mb-4">Infrastructure Layer</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-blue-400 font-medium">Git Worktrees</div>
                  <div className="text-gray-400">Session Isolation</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-purple-400 font-medium">SQLite DB</div>
                  <div className="text-gray-400">Data Persistence</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-green-400 font-medium">Rust Backend</div>
                  <div className="text-gray-400">Tauri Framework</div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <div className="text-yellow-400 font-medium">Process Isolation</div>
                  <div className="text-gray-400">Security Layer</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default Architecture