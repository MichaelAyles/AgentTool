import React from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, GitBranch, Bot, Zap } from 'lucide-react'

const Hero: React.FC = () => {
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
          className="flex flex-wrap justify-center gap-3 mb-16"
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