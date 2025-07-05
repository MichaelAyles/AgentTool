import React from 'react'
import { motion } from 'framer-motion'
import { 
  GitBranch, 
  Bot, 
  Shield, 
  Zap, 
  Users, 
  Database,
  Monitor,
  Settings
} from 'lucide-react'

const features = [
  {
    icon: GitBranch,
    title: 'Git Worktree Isolation',
    description: 'Each session gets its own isolated git worktree and branch, inspired by Crystal\'s architecture.',
    color: 'from-green-400 to-emerald-500'
  },
  {
    icon: Bot,
    title: 'Multi-Agent Orchestration',
    description: 'Intelligent middle manager coordinates Claude Code and Gemini CLI agents with OpenRouter integration.',
    color: 'from-blue-400 to-cyan-500'
  },
  {
    icon: Shield,
    title: 'Secure Process Isolation',
    description: 'Each agent runs in isolated processes with granular permissions, inspired by Claudia\'s security model.',
    color: 'from-purple-400 to-violet-500'
  },
  {
    icon: Zap,
    title: 'Real-time Coordination',
    description: 'Agents communicate through structured protocols with task decomposition and result aggregation.',
    color: 'from-yellow-400 to-orange-500'
  },
  {
    icon: Users,
    title: 'Session Management',
    description: 'Persistent conversation tracking across agents with Crystal-style session persistence.',
    color: 'from-pink-400 to-rose-500'
  },
  {
    icon: Database,
    title: 'SQLite Backend',
    description: 'Robust data persistence with Rust+Tauri architecture for maximum performance and reliability.',
    color: 'from-indigo-400 to-blue-500'
  },
  {
    icon: Monitor,
    title: 'Desktop Interface',
    description: 'Beautiful desktop application with React+TypeScript frontend and shadcn/ui components.',
    color: 'from-teal-400 to-cyan-500'
  },
  {
    icon: Settings,
    title: 'Configurable Permissions',
    description: 'Fine-grained control over file access, network permissions, and process spawning for each agent.',
    color: 'from-red-400 to-pink-500'
  }
]

const Features: React.FC = () => {
  return (
    <section className="py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            <span className="text-gradient bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              Powerful Features
            </span>
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Built with the best ideas from Claudia and Crystal, AgentTool combines 
            secure agent management with isolated development environments.
          </p>
        </motion.div>

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className="group"
            >
              <div className="h-full p-6 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl hover:border-white/20 transition-all duration-300">
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${feature.color} p-2.5 mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="w-full h-full text-white" />
                </div>
                
                {/* Content */}
                <h3 className="text-xl font-semibold mb-3 text-white group-hover:text-blue-300 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Features