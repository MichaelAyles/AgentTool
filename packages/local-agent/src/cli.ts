#!/usr/bin/env node

import { Command } from 'commander';
import { LocalAgent, LocalAgentConfig } from './index.js';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import ora from 'ora';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('vibe-code-agent')
  .description(
    'Vibe Code Local Agent - Connect your local terminal to the web interface'
  )
  .version('1.0.0');

program
  .command('connect')
  .description('Connect to a Vibe Code server with a session ID')
  .argument('<session-id>', 'Session ID from the web interface')
  .option(
    '-s, --server <url>',
    'Server URL',
    process.env.VIBE_CODE_SERVER_URL || 'https://vibecode.com'
  )
  .option('-p, --port <number>', 'Local port to use', '3001')
  .option(
    '-t, --ngrok-token <token>',
    'Ngrok auth token',
    process.env.NGROK_TOKEN
  )
  .action(async (sessionId: string, options) => {
    try {
      // Validate session ID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(sessionId)) {
        console.error(
          chalk.red('Error: Invalid session ID format. Expected UUID format.')
        );
        process.exit(1);
      }

      const config: LocalAgentConfig = {
        sessionId,
        serverUrl: options.server,
        port: parseInt(options.port),
        ngrokToken: options.ngrokToken,
      };

      console.log(chalk.blue('🔗 Vibe Code Local Agent'));
      console.log(chalk.gray('=============================='));
      console.log(chalk.gray(`Session ID: ${sessionId}`));
      console.log(chalk.gray(`Server: ${config.serverUrl}`));
      console.log(chalk.gray(`Port: ${config.port}`));
      console.log('');

      const agent = new LocalAgent(config);

      // Handle graceful shutdown
      const cleanup = async () => {
        try {
          await agent.stop();
          process.exit(0);
        } catch (error) {
          console.error(chalk.red('Error during cleanup:'), error);
          process.exit(1);
        }
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Start the agent
      await agent.start();

      // Keep the process running
      await new Promise(() => {}); // Run forever until killed
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

program
  .command('generate-session')
  .description('Generate a new session ID')
  .action(() => {
    const sessionId = uuidv4();
    console.log(chalk.green('Generated session ID:'));
    console.log(chalk.cyan(sessionId));
    console.log('');
    console.log(chalk.gray('Use this session ID with the "connect" command:'));
    console.log(chalk.gray(`vibe-code-agent connect ${sessionId}`));
  });

program
  .command('test-connection')
  .description('Test connection to a Vibe Code server')
  .option(
    '-s, --server <url>',
    'Server URL to test',
    process.env.VIBE_CODE_SERVER_URL || 'https://vibecode.com'
  )
  .action(async options => {
    const spinner = ora(`Testing connection to ${options.server}...`).start();

    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(`${options.server}/health`, {
        method: 'GET',
        timeout: 10000,
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        spinner.succeed(
          chalk.green(`Successfully connected to ${options.server}`)
        );
        console.log(chalk.gray('Server status:'), data.status);
        console.log(chalk.gray('Timestamp:'), data.timestamp);
      } else {
        spinner.fail(
          chalk.red(`Server responded with status: ${response.status}`)
        );
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(chalk.red('Connection failed'));
      console.error(
        chalk.gray('Error:'),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current agent status')
  .action(() => {
    console.log(chalk.blue('Vibe Code Local Agent Status'));
    console.log(chalk.gray('================================'));
    console.log(chalk.gray(`Platform: ${process.platform}`));
    console.log(chalk.gray(`Node.js: ${process.version}`));
    console.log(chalk.gray(`Working Directory: ${process.cwd()}`));

    // Check for required dependencies
    const checkDependency = (name: string) => {
      try {
        require.resolve(name);
        return chalk.green('✓');
      } catch {
        return chalk.red('✗');
      }
    };

    console.log('');
    console.log(chalk.blue('Dependencies:'));
    console.log(`  Express: ${checkDependency('express')}`);
    console.log(`  node-pty: ${checkDependency('node-pty')}`);
    console.log(`  WebSocket: ${checkDependency('ws')}`);
    console.log(`  ngrok: ${checkDependency('ngrok')}`);

    // Check environment variables
    console.log('');
    console.log(chalk.blue('Environment:'));
    console.log(
      `  VIBE_CODE_SERVER_URL: ${process.env.VIBE_CODE_SERVER_URL || chalk.gray('(default)')}`
    );
    console.log(
      `  NGROK_TOKEN: ${process.env.NGROK_TOKEN ? chalk.green('set') : chalk.yellow('not set')}`
    );
    console.log(`  PORT: ${process.env.PORT || chalk.gray('(default: 3001)')}`);
  });

// Show help if no command provided
if (process.argv.length <= 2) {
  program.help();
}

program.parse();
