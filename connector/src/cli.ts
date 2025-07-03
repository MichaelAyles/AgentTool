#!/usr/bin/env node

import { program } from 'commander';
import { VibeConnector } from './index';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

program
  .name('vibe-connector')
  .description('DuckBridge Desktop Connector - Bridge your terminal to AI-powered coding')
  .version('0.1.0');

// Start command
program
  .command('start')
  .description('Start the desktop connector')
  .option('-p, --port <number>', 'HTTP API port', '3001')
  .option('-w, --ws-port <number>', 'WebSocket port', '3002')
  .option('--no-banner', 'Disable startup banner')
  .action(async (options) => {
    try {
      if (options.banner !== false) {
        console.log('🦆 DuckBridge Connector');
        console.log('========================');
      }

      const httpPort = parseInt(options.port);
      const wsPort = parseInt(options.wsPort);

      const connector = new VibeConnector(httpPort, wsPort);
      await connector.start();

    } catch (error) {
      console.error('❌ Failed to start connector:', error);
      process.exit(1);
    }
  });

// Generate UUID command
program
  .command('uuid')
  .description('Generate a new session UUID')
  .action(() => {
    const uuid = uuidv4();
    console.log('🆔 Generated UUID:', uuid);
    console.log('');
    console.log('💡 Usage:');
    console.log('   1. Start the connector: vibe-connector start');
    console.log('   2. Visit: https://frontend-three-delta-48.vercel.app');
    console.log(`   3. Enter UUID: ${uuid}`);
  });

// Status command
program
  .command('status')
  .description('Check connector status')
  .option('-p, --port <number>', 'HTTP API port', '3001')
  .action(async (options) => {
    const port = parseInt(options.port);
    const url = `http://localhost:${port}/health`;

    try {
      const response = await axios.get(url, { timeout: 5000 });
      const data = response.data;

      console.log('📊 Connector Status');
      console.log('==================');
      console.log(`Status: ${data.status}`);
      console.log(`UUID: ${data.uuid}`);
      console.log(`Uptime: ${Math.floor(data.timestamp ? (Date.now() - new Date(data.timestamp).getTime()) / 1000 : 0)}s`);
      console.log(`Active Sessions: ${data.sessions.active}`);
      console.log(`Total Sessions: ${data.sessions.total}`);
      console.log(`WebSocket Clients: ${data.websocket.clients}`);
      console.log(`WebSocket Port: ${data.websocket.port}`);

    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        console.log('❌ Connector is not running');
        console.log('💡 Start it with: vibe-connector start');
      } else {
        console.error('❌ Failed to check status:', error instanceof Error ? error.message : error);
      }
      process.exit(1);
    }
  });

// List sessions command
program
  .command('sessions')
  .description('List active sessions')
  .option('-p, --port <number>', 'HTTP API port', '3001')
  .action(async (options) => {
    const port = parseInt(options.port);
    const url = `http://localhost:${port}/sessions`;

    try {
      const response = await axios.get(url, { timeout: 5000 });
      const data = response.data;

      console.log('📋 Active Sessions');
      console.log('==================');

      if (data.terminal_sessions.length === 0) {
        console.log('No active sessions');
      } else {
        data.terminal_sessions.forEach((session: any, index: number) => {
          console.log(`${index + 1}. UUID: ${session.uuid}`);
          console.log(`   ID: ${session.id}`);
          console.log(`   Active: ${session.isActive}`);
          console.log(`   Created: ${new Date(session.createdAt).toLocaleString()}`);
          console.log(`   Last Activity: ${new Date(session.lastActivity).toLocaleString()}`);
          console.log('');
        });
      }

      if (data.websocket_clients.length > 0) {
        console.log('🔌 WebSocket Clients');
        console.log('===================');
        data.websocket_clients.forEach((client: any, index: number) => {
          console.log(`${index + 1}. UUID: ${client.uuid}`);
          console.log(`   Authenticated: ${client.authenticated}`);
          console.log(`   Last Ping: ${new Date(client.lastPing).toLocaleString()}`);
          console.log('');
        });
      }

    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        console.log('❌ Connector is not running');
        console.log('💡 Start it with: vibe-connector start');
      } else {
        console.error('❌ Failed to list sessions:', error instanceof Error ? error.message : error);
      }
      process.exit(1);
    }
  });

// Kill session command
program
  .command('kill <uuid>')
  .description('Terminate a session by UUID')
  .option('-p, --port <number>', 'HTTP API port', '3001')
  .action(async (uuid, options) => {
    const port = parseInt(options.port);
    const url = `http://localhost:${port}/sessions/${uuid}`;

    try {
      const response = await axios.delete(url, { timeout: 5000 });
      const data = response.data;

      if (data.success) {
        console.log(`✅ Session ${uuid} terminated`);
      } else {
        console.log(`❌ Session ${uuid} not found`);
      }

    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        console.log('❌ Connector is not running');
        console.log('💡 Start it with: vibe-connector start');
      } else {
        console.error('❌ Failed to terminate session:', error instanceof Error ? error.message : error);
      }
      process.exit(1);
    }
  });

// Test connection command
program
  .command('test')
  .description('Test connection to frontend')
  .option('-u, --uuid <uuid>', 'Use specific UUID for testing')
  .action(async (options) => {
    const testUuid = options.uuid || uuidv4();
    
    console.log('🧪 Testing Connection');
    console.log('====================');
    console.log(`Test UUID: ${testUuid}`);
    console.log('Frontend URL: https://frontend-three-delta-48.vercel.app');
    console.log('');
    console.log('💡 Manual Test Steps:');
    console.log('1. Start connector: vibe-connector start');
    console.log('2. Open frontend in browser');
    console.log(`3. Enter UUID: ${testUuid}`);
    console.log('4. Check if terminal connects');
    console.log('');
    console.log('🔍 Automated tests coming soon...');
  });

// Info command
program
  .command('info')
  .description('Show connector information')
  .option('-p, --port <number>', 'HTTP API port', '3001')
  .action(async (options) => {
    const port = parseInt(options.port);
    const url = `http://localhost:${port}/info`;

    try {
      const response = await axios.get(url, { timeout: 5000 });
      const data = response.data;

      console.log('ℹ️  Connector Information');
      console.log('========================');
      console.log(`Name: ${data.name}`);
      console.log(`Version: ${data.version}`);
      console.log(`UUID: ${data.uuid}`);
      console.log(`Platform: ${data.platform}`);
      console.log(`Node Version: ${data.node_version}`);
      console.log(`Uptime: ${Math.floor(data.uptime)}s`);
      console.log(`Memory Usage: ${Math.round(data.memory.rss / 1024 / 1024)}MB`);
      console.log(`WebSocket URL: ${data.websocket_url}`);
      console.log(`HTTP URL: ${data.http_url}`);

    } catch (error) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        console.log('❌ Connector is not running');
        console.log('💡 Start it with: vibe-connector start');
      } else {
        console.error('❌ Failed to get info:', error instanceof Error ? error.message : error);
      }
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}