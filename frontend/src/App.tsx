import React from 'react'
import { motion } from 'framer-motion'
import Hero from './components/Hero'
import Features from './components/Features'
import Architecture from './components/Architecture'
import InstallSection from './components/InstallSection'
import Footer from './components/Footer'

function App() {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-indigo-900/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_200px,#3b82f6,transparent)]" />
      </div>
      
      {/* Content */}
      <div className="relative z-10">
        <Hero />
        <Features />
        <Architecture />
        <InstallSection />
        <Footer />
      </div>
    </div>
  )
}

export default App