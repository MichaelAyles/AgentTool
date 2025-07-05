import React from 'react'
import { motion } from 'framer-motion'
import { Github, Star, GitBranch, Heart } from 'lucide-react'

const Footer: React.FC = () => {
  return (
    <footer className="py-16 px-4 border-t border-white/10">
      <div className="max-w-6xl mx-auto">
        {/* Main footer content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <h3 className="text-2xl font-bold mb-4">
                <span className="text-gradient bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
                  AgentTool
                </span>
              </h3>
              <p className="text-gray-400 mb-6 max-w-md">
                Hierarchical Multi-Agent System for AI-Powered Development. 
                Orchestrate Claude Code and Gemini CLI with intelligent session isolation.
              </p>
              <div className="flex space-x-4">
                <a 
                  href="https://github.com/MichaelAyles/AgentTool" 
                  className="p-2 bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg hover:border-white/40 transition-colors"
                  aria-label="GitHub Repository"
                >
                  <Github size={20} />
                </a>
                <a 
                  href="https://github.com/MichaelAyles/AgentTool/stargazers" 
                  className="p-2 bg-white/10 backdrop-blur-lg border border-white/20 rounded-lg hover:border-white/40 transition-colors"
                  aria-label="Star on GitHub"
                >
                  <Star size={20} />
                </a>
              </div>
            </motion.div>
          </div>

          {/* Documentation */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <h4 className="text-lg font-semibold text-white mb-4">Documentation</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Getting Started
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Architecture Guide
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    API Reference
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Configuration
                  </a>
                </li>
              </ul>
            </motion.div>
          </div>

          {/* Community */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <h4 className="text-lg font-semibold text-white mb-4">Community</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    GitHub Issues
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Discussions
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Contributing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition-colors">
                    Code of Conduct
                  </a>
                </li>
              </ul>
            </motion.div>
          </div>
        </div>

        {/* Inspired by section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="text-center py-8 border-t border-white/10"
        >
          <p className="text-gray-400 mb-4">Inspired by amazing projects:</p>
          <div className="flex flex-wrap justify-center gap-6">
            <a 
              href="https://claudiacode.com/" 
              className="flex items-center space-x-2 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <GitBranch size={16} />
              <span>Claudia</span>
            </a>
            <a 
              href="https://github.com/stravu/crystal" 
              className="flex items-center space-x-2 text-purple-400 hover:text-purple-300 transition-colors"
            >
              <GitBranch size={16} />
              <span>Crystal</span>
            </a>
          </div>
        </motion.div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10"
        >
          <p className="text-gray-400 text-sm mb-4 md:mb-0">
            © 2025 AgentTool. Licensed under MIT License.
          </p>
          <div className="flex items-center space-x-1 text-gray-400 text-sm">
            <span>Made with</span>
            <Heart size={14} className="text-red-400" />
            <span>for the AI development community</span>
          </div>
        </motion.div>
      </div>
    </footer>
  )
}

export default Footer