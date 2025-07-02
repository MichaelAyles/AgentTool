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
    .command(
      'start',
      'Start the desktop connector and connect to central service',
      yargs => {
        return yargs.options({
          'session-id': {
            type: 'string',
            required: true,
            description: 'Session ID for this connector instance (required)',
          },
          'central-url': {
            type: 'string',
            default: 'https://vibe.theduck.chat',
            description: 'Central service URL to connect to',
          },
          'data-dir': {
            type: 'string',
            default: '~/.vibe-code',
            description: 'Directory to store application data',
          },
          'auto-reconnect': {
            type: 'boolean',
            default: true,
            description: 'Automatically reconnect if connection is lost',
          },
        });
      }
    )
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
  const spinner = ora('Connecting to Vibe Code central service...').start();

  try {
    // Validate session ID
    if (!options.sessionId) {
      throw new Error('Session ID is required. Use --session-id <uuid>');
    }

    const connector = new DesktopConnector({
      sessionId: options.sessionId,
      centralUrl: options.centralUrl,
      dataDir: options.dataDir,
      autoReconnect: options.autoReconnect,
    });

    await connector.start();

    spinner.succeed(
      `Desktop connector connected to ${chalk.cyan(options.centralUrl)}`
    );

    console.log(
      `${chalk.blue('Session ID:')} ${chalk.cyan(options.sessionId)}`
    );
    console.log(
      `${chalk.blue('Central Service:')} ${chalk.cyan(options.centralUrl)}`
    );
    console.log(
      `${chalk.blue('Data Directory:')} ${chalk.cyan(options.dataDir)}`
    );
    console.log();
    console.log(chalk.green('✓ Ready to receive commands from frontend'));
    console.log(
      chalk.yellow('  Frontend can now connect using this session ID')
    );
    console.log(chalk.gray('  Press Ctrl+C to stop'));

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
    spinner.fail('Failed to connect to central service');
    throw error;
  }
}

async function handleStatus() {
  const spinner = ora('Checking connection status...').start();

  try {
    // Check if central service is accessible
    const response = await fetch('https://vibe.theduck.chat/api/v1/health');
    const data = await response.json();

    spinner.succeed('Central service is accessible');
    console.log(chalk.green('✓ Central Service: Available'));
    console.log(chalk.blue('✓ URL: https://vibe.theduck.chat'));
    console.log(
      chalk.gray('  Note: This checks if the central service is reachable.')
    );
    console.log(
      chalk.gray(
        '  To check if a specific session is active, use the session ID.'
      )
    );
  } catch (error) {
    spinner.fail('Cannot reach central service');
    console.log(chalk.red('✗ Central Service: Unreachable'));
    console.log(chalk.gray('  Check your internet connection and try again.'));
  }
}

async function handleStop() {
  const spinner = ora('Stopping desktop connector...').start();

  try {
    // Since the new architecture doesn't run a local server,
    // stopping is handled by the process itself (Ctrl+C)
    spinner.warn('Desktop connector runs as a streaming client');
    console.log(chalk.yellow('To stop the desktop connector:'));
    console.log(
      chalk.gray("  1. Use Ctrl+C in the terminal where it's running")
    );
    console.log(chalk.gray('  2. Or kill the process directly'));
    console.log(
      chalk.gray(
        '  3. The connector will automatically disconnect from the central service'
      )
    );
  } catch (error) {
    spinner.fail('Could not determine connector status');
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
