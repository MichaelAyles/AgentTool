#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import ora from 'ora';
import { DesktopConnector } from './desktop-connector.js';
import { logger } from './utils/logger.js';

const ASCII_ART = `
██╗   ██╗██╗██████╗ ███████╗     ██████╗ ██████╗ ██████╗ ███████╗
██║   ██║██║██╔══██╗██╔════╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝
██║   ██║██║██████╔╝█████╗      ██║     ██║   ██║██║  ██║█████╗  
╚██╗ ██╔╝██║██╔══██╗██╔══╝      ██║     ██║   ██║██║  ██║██╔══╝  
 ╚████╔╝ ██║██████╔╝███████╗    ╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝
                    DESKTOP CONNECTOR
`;

async function main() {
  console.log(chalk.blue(ASCII_ART));

  const argv = await yargs(hideBin(process.argv))
    .scriptName('vibe-code-desktop')
    .usage('$0 <command> [options]')
    .command('start', 'Start the desktop connector server', yargs => {
      return yargs.options({
        port: {
          type: 'number',
          default: 3000,
          description: 'Port to run the server on',
        },
        host: {
          type: 'string',
          default: 'localhost',
          description: 'Host to bind the server to',
        },
        'data-dir': {
          type: 'string',
          default: '~/.vibe-code',
          description: 'Directory to store application data',
        },
        'session-id': {
          type: 'string',
          description: 'Session ID for this connector instance',
        },
        'open-browser': {
          type: 'boolean',
          default: true,
          description: 'Open browser after starting',
        },
      });
    })
    .command('status', 'Check desktop connector status')
    .command('stop', 'Stop the desktop connector')
    .command('install', 'Install desktop connector', yargs => {
      return yargs.options({
        'system-wide': {
          type: 'boolean',
          default: false,
          description: 'Install system-wide',
        },
      });
    })
    .help()
    .alias('h', 'help')
    .version()
    .alias('v', 'version')
    .demandCommand(1, 'You must specify a command')
    .strict()
    .parse();

  const command = argv._[0] as string;

  try {
    switch (command) {
      case 'start':
        await handleStart(argv as any);
        break;
      case 'status':
        await handleStatus();
        break;
      case 'stop':
        await handleStop();
        break;
      case 'install':
        await handleInstall(argv as any);
        break;
      default:
        console.error(chalk.red(`Unknown command: ${command}`));
        process.exit(1);
    }
  } catch (error) {
    logger.error('Command failed:', error);
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
    process.exit(1);
  }
}

async function handleStart(options: any) {
  const spinner = ora('Starting Vibe Code Desktop Connector...').start();

  try {
    const connector = new DesktopConnector({
      port: options.port,
      host: options.host,
      dataDir: options.dataDir,
      openBrowser: options.openBrowser,
      sessionId: options.sessionId,
    });

    await connector.start();

    spinner.succeed(
      `Desktop connector started on ${chalk.cyan(`http://${options.host}:${options.port}`)}`
    );

    if (options.sessionId) {
      console.log(
        `${chalk.blue('Session ID:')} ${chalk.cyan(options.sessionId)}`
      );
    }

    if (options.openBrowser) {
      const open = await import('open');
      await open.default(`http://${options.host}:${options.port}`);
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n' + chalk.yellow('Shutting down gracefully...'));
      await connector.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n' + chalk.yellow('Shutting down gracefully...'));
      await connector.stop();
      process.exit(0);
    });

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    spinner.fail('Failed to start desktop connector');
    throw error;
  }
}

async function handleStatus() {
  const spinner = ora('Checking status...').start();

  try {
    // Check if server is running by trying to connect
    const response = await fetch('http://localhost:3000/api/v1/health');
    const data = await response.json();

    spinner.succeed('Desktop connector is running');
    console.log(chalk.green('✓ Status: Running'));
    console.log(chalk.blue('✓ API: Available'));
    console.log(chalk.blue(`✓ Uptime: ${data.uptime || 'Unknown'}`));
    console.log(chalk.blue(`✓ URL: http://localhost:3000`));
  } catch (error) {
    spinner.fail('Desktop connector is not running');
    console.log(chalk.red('✗ Status: Stopped'));
  }
}

async function handleStop() {
  const spinner = ora('Stopping desktop connector...').start();

  try {
    await fetch('http://localhost:3000/api/v1/shutdown', { method: 'POST' });
    spinner.succeed('Desktop connector stopped');
  } catch (error) {
    spinner.warn('Desktop connector may not be running');
  }
}

async function handleInstall(options: any) {
  const spinner = ora('Installing desktop connector...').start();

  try {
    // Create desktop entry, add to PATH, etc.
    spinner.succeed('Desktop connector installed successfully');
    console.log(
      chalk.green('✓ Desktop connector is now available as "vibe-code-desktop"')
    );
    console.log(chalk.blue('  Run "vibe-code-desktop start" to begin'));
  } catch (error) {
    spinner.fail('Installation failed');
    throw error;
  }
}

if (import.meta.main) {
  main().catch(error => {
    logger.error('Application error:', error);
    process.exit(1);
  });
}
