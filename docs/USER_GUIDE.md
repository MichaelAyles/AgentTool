# Vibe Code User Guide

Welcome to Vibe Code - your universal web-based platform for managing AI coding assistants. This comprehensive guide will help you get the most out of the platform.

## 📚 Table of Contents

1. [Getting Started](#getting-started)
2. [Platform Overview](#platform-overview)
3. [Project Management](#project-management)
4. [Working with Adapters](#working-with-adapters)
5. [Using the Terminal](#using-the-terminal)
6. [Git Integration](#git-integration)
7. [Security Features](#security-features)
8. [Settings and Configuration](#settings-and-configuration)
9. [Troubleshooting](#troubleshooting)
10. [Tips and Best Practices](#tips-and-best-practices)

## 🚀 Getting Started

### First Time Setup

1. **Access Vibe Code**
   - Open your web browser and navigate to your Vibe Code instance
   - Default: http://localhost:5173 (development) or your deployed URL

2. **Create Your Account**
   - Click "Sign Up" if you're a new user
   - Or use your existing credentials to log in
   - Enable two-factor authentication for enhanced security

3. **Install AI Tools** (if not already available)
   - The platform will automatically detect installed AI tools
   - Follow prompts to install missing tools like Claude Code or Gemini CLI
   - Or use the built-in installation helpers

### Quick Tour

1. **Dashboard**: Overview of your projects and recent activity
2. **Projects**: Create, manage, and organize your coding projects
3. **Terminal**: Interactive terminal for AI assistant communication
4. **Adapters**: Configure and manage AI tool integrations
5. **Settings**: Customize your experience and security preferences

## 🏗️ Platform Overview

### What is Vibe Code?

Vibe Code is a web-based platform that unifies multiple AI coding assistants into a single, powerful interface. Instead of switching between different CLI tools and terminals, you can:

- Work with multiple AI assistants simultaneously
- Manage projects with integrated git functionality
- Execute commands in a secure, monitored environment
- Share projects and collaborate with team members

### Key Benefits

- **🌐 Browser-Based**: Access from anywhere, no desktop installation required
- **🔄 Multi-AI**: Use Claude Code, Gemini CLI, and other tools seamlessly
- **🔒 Secure**: Built-in security with safe and dangerous modes
- **📁 Organized**: Project-based workflow with git integration
- **⚡ Real-Time**: Live output streaming and collaborative features

## 📁 Project Management

### Creating a New Project

1. **Click "Create Project"** on the dashboard
2. **Fill in Project Details**:
   - **Name**: Choose a descriptive project name
   - **Description**: Brief description of the project
   - **Path**: Local file system path (or auto-generated)
   - **Template**: Start from a template or empty project

3. **Configure Initial Settings**:
   - **Primary Adapter**: Choose your main AI assistant
   - **Git Repository**: Initialize new repo or clone existing
   - **Security Mode**: Start in safe or dangerous mode

4. **Click "Create"** to set up your project

### Project Structure

Each project contains:

```
my-project/
├── .vibecode/          # Vibe Code configuration
│   ├── config.json     # Project settings
│   ├── adapters/       # Custom adapter configurations
│   └── logs/          # Execution logs
├── src/               # Your source code
├── docs/              # Documentation
├── tests/             # Test files
└── README.md          # Project documentation
```

### Managing Projects

- **Open Project**: Click on any project card to open it
- **Project Settings**: Access via the gear icon on project cards
- **Delete Project**: Use the delete option (requires confirmation)
- **Archive Project**: Hide completed projects from the main view
- **Share Project**: Generate sharing links for collaboration

### Project Templates

Vibe Code includes several project templates:

- **Web Development**: React, Vue, or vanilla JavaScript projects
- **Python Data Science**: Jupyter notebooks and data analysis tools
- **Node.js Backend**: Express servers and API development
- **Documentation**: Markdown-based documentation projects
- **Custom**: Start with your own template or blank project

## 🔌 Working with Adapters

### What are Adapters?

Adapters are connectors that allow Vibe Code to communicate with different AI tools. Each adapter handles:

- Starting and stopping the AI tool
- Translating commands between Vibe Code and the tool
- Managing authentication and configuration
- Streaming output and handling errors

### Available Adapters

| Adapter           | Description                                  | Status    |
| ----------------- | -------------------------------------------- | --------- |
| **Claude Code**   | Anthropic's Claude coding assistant          | ✅ Stable |
| **Gemini CLI**    | Google's Gemini AI interface                 | ✅ Stable |
| **Custom Script** | Execute custom scripts in multiple languages | ✅ Stable |
| **OpenAI CLI**    | GPT-based coding assistant                   | 🚧 Beta   |

### Installing Adapters

1. **Navigate to Adapters** section
2. **Browse Available Adapters** in the adapter marketplace
3. **Click "Install"** on desired adapters
4. **Follow Installation Prompts** for any required dependencies
5. **Configure Authentication** (API keys, tokens, etc.)

### Configuring Adapters

Each adapter has specific configuration options:

#### Claude Code Adapter

- **API Key**: Your Anthropic API key
- **Model**: Claude model to use (claude-3, claude-instant)
- **Max Tokens**: Maximum response length
- **Temperature**: Response creativity (0.0 - 1.0)

#### Gemini CLI Adapter

- **API Key**: Your Google AI API key
- **Project ID**: Google Cloud project ID
- **Model**: Gemini model version
- **Safety Settings**: Content filtering levels

#### Custom Script Adapter

- **Interpreter**: Choose from 15+ supported languages
- **Script Path**: Path to your custom script
- **Arguments**: Default arguments to pass
- **Environment**: Environment variables

### Switching Adapters

You can switch between adapters:

1. **During Project Creation**: Select primary adapter
2. **In Project Settings**: Change the default adapter
3. **In Terminal**: Use `/adapter <name>` command
4. **Quick Switch**: Use the adapter dropdown in the terminal

## 💻 Using the Terminal

### Terminal Interface

The terminal is your primary interface for interacting with AI assistants:

- **Input Area**: Type commands and prompts
- **Output Area**: See AI responses and system messages
- **Status Bar**: Shows current adapter, mode, and connection status
- **Command History**: Access previous commands with up/down arrows

### Basic Commands

```bash
# Get help
help                    # Show available commands
version                 # Show version information

# Adapter management
/adapter list           # List available adapters
/adapter switch claude  # Switch to Claude Code adapter
/adapter config         # Show current adapter config

# Project commands
/project status         # Show project information
/project git status     # Show git status
/project files          # List project files

# System commands
/mode safe             # Switch to safe mode
/mode dangerous        # Request dangerous mode
/clear                 # Clear terminal output
/history               # Show command history
```

### Working with AI Assistants

#### Claude Code Example

```bash
# Basic interaction
Hello Claude, can you help me write a Python function?

# Code generation
Create a REST API endpoint for user authentication using Flask

# Code review
Please review this JavaScript function for potential security issues:
[paste your code here]

# File-specific help
Help me optimize this SQL query in database.py
```

#### Gemini CLI Example

```bash
# Code explanation
Explain how this React component works:
[paste component code]

# Debugging assistance
I'm getting this error in my Node.js app: [error message]
Can you help me fix it?

# Architecture advice
What's the best way to structure a microservices architecture?
```

### File Integration

You can reference files in your prompts:

1. **Drag and Drop**: Drag files from the file explorer into the terminal
2. **File References**: Use `@filename` to reference files
3. **Code Blocks**: Paste code directly into the terminal
4. **Context Sharing**: AI assistants can access your project context

### Terminal Features

- **Syntax Highlighting**: Code in responses is automatically highlighted
- **Copy/Paste**: Easy copying of code snippets and commands
- **Search History**: Find previous commands and responses
- **Export Conversations**: Save important conversations
- **Multiple Tabs**: Work with different assistants simultaneously

## 🔗 Git Integration

### Git Features

Vibe Code provides comprehensive git integration:

- **Visual Status**: See changed files, branches, and commit history
- **Branch Management**: Create, switch, and merge branches
- **Commit Interface**: Stage changes and create commits
- **Remote Sync**: Push, pull, and manage remote repositories
- **Conflict Resolution**: Visual merge conflict resolution

### Getting Started with Git

#### Initialize a Repository

1. **Open Project Settings**
2. **Go to Git Tab**
3. **Click "Initialize Repository"**
4. **Choose to create new or clone existing**

#### Daily Git Workflow

1. **Check Status**
   - View changed files in the git panel
   - See current branch and upstream status

2. **Stage Changes**
   - Click checkboxes next to files to stage
   - Or use "Stage All" for all changes

3. **Create Commits**
   - Write descriptive commit messages
   - Use AI assistance for commit message suggestions
   - Click "Commit" to create the commit

4. **Sync with Remote**
   - "Pull" to get latest changes
   - "Push" to send your commits
   - Resolve conflicts if needed

### Branch Management

#### Creating Branches

1. **Click the branch dropdown**
2. **Click "Create Branch"**
3. **Enter branch name**
4. **Choose source branch**
5. **Click "Create and Switch"**

#### Switching Branches

1. **Click the branch dropdown**
2. **Select desired branch**
3. **Confirm switch if there are uncommitted changes**

#### Merging Branches

1. **Switch to target branch** (usually main/master)
2. **Click "Merge"** in the git panel
3. **Select source branch**
4. **Resolve conflicts if any**
5. **Complete the merge**

### Advanced Git Features

#### Worktrees

- Work on multiple branches simultaneously
- Each worktree is a separate working directory
- Perfect for comparing features or maintaining multiple versions

#### Commit History

- Visual commit graph with branch relationships
- Click commits to see changes
- Cherry-pick commits between branches

#### Remote Management

- Add multiple remotes (origin, upstream, etc.)
- Configure push/pull defaults
- Manage SSH keys and authentication

## 🔒 Security Features

### Security Modes

Vibe Code operates in two security modes:

#### Safe Mode (Default)

- **Sandboxed Execution**: Commands run in isolated containers
- **Limited File Access**: Only project directories are accessible
- **Network Restrictions**: Controlled internet access
- **Command Filtering**: Dangerous commands require confirmation

#### Dangerous Mode

- **Full System Access**: Complete access to your system
- **Explicit Activation**: Requires user confirmation
- **Time Limits**: Automatically expires after set time
- **Audit Logging**: All actions are logged

### Activating Dangerous Mode

1. **Type `/mode dangerous`** in the terminal
2. **Read the security warning** carefully
3. **Confirm activation** by typing "I UNDERSTAND"
4. **Set time limit** (default: 1 hour)
5. **Mode activates** with visual indicators

### Security Best Practices

- **Start in Safe Mode**: Default for all new projects
- **Use Dangerous Mode Sparingly**: Only when necessary
- **Review Audit Logs**: Check what happened in dangerous mode
- **Secure API Keys**: Store credentials securely
- **Regular Updates**: Keep adapters and platform updated

### Audit and Monitoring

- **Security Dashboard**: Overview of security events
- **Audit Logs**: Detailed logs of all actions
- **Alerts**: Notifications for suspicious activity
- **Reports**: Regular security summaries

## ⚙️ Settings and Configuration

### User Preferences

Access settings via the gear icon in the top navigation:

#### General Settings

- **Theme**: Light, dark, or auto mode
- **Language**: Interface language
- **Timezone**: For logs and timestamps
- **Notifications**: Email and in-app notifications

#### Terminal Settings

- **Font Family**: Choose your preferred font
- **Font Size**: Adjust for readability
- **Color Scheme**: Customize terminal colors
- **Cursor Style**: Block, line, or underline

#### Security Settings

- **Default Mode**: Safe or dangerous mode for new projects
- **Session Timeout**: Auto-logout time
- **Two-Factor Auth**: Enable/disable 2FA
- **API Key Management**: Manage stored credentials

### Project Settings

Each project has individual settings:

#### General

- **Project Name and Description**
- **Default Adapter**: Primary AI assistant
- **Working Directory**: Base path for commands
- **File Patterns**: Include/exclude file types

#### Security

- **Security Mode**: Override global default
- **Allowed Commands**: Whitelist specific commands
- **Restricted Paths**: Block access to sensitive directories
- **Network Access**: Control internet connectivity

#### Git Configuration

- **User Name and Email**: Git commit identity
- **Default Branch**: Main branch name
- **Remote URLs**: Configure git remotes
- **Hooks**: Pre-commit and post-commit actions

### Global Configuration

Admin users can configure global settings:

#### System Settings

- **Resource Limits**: CPU, memory, and storage limits
- **Rate Limiting**: API call limits
- **Backup Schedule**: Automatic backups
- **Update Policy**: Automatic updates

#### Security Policy

- **Password Requirements**: Complexity rules
- **Session Management**: Global timeout policies
- **Audit Retention**: How long to keep logs
- **IP Restrictions**: Limit access by IP address

## 🔧 Troubleshooting

### Common Issues

#### "Adapter Not Found" Error

**Problem**: Selected adapter is not installed or configured
**Solution**:

1. Go to Adapters section
2. Install the required adapter
3. Configure authentication if needed
4. Restart the project

#### "Connection Failed" Error

**Problem**: Cannot connect to AI service
**Solution**:

1. Check internet connection
2. Verify API keys are correct
3. Check service status pages
4. Try switching to a different adapter

#### "Permission Denied" Error

**Problem**: Insufficient permissions for file or command
**Solution**:

1. Check if you're in safe mode (may need dangerous mode)
2. Verify file permissions
3. Check project security settings
4. Contact administrator if needed

#### Slow Performance

**Problem**: Terminal or interface is slow
**Solution**:

1. Clear terminal history (`/clear`)
2. Close unused projects
3. Check system resources
4. Restart browser or clear cache

### Debug Information

To help with troubleshooting:

1. **Check Console**: Open browser developer tools
2. **View Logs**: Access via Settings > Logs
3. **Copy Error Details**: Include full error messages
4. **System Information**: Note browser, OS, and versions

### Getting Help

- **Documentation**: Check this guide and other docs
- **Community Forum**: Ask questions in discussions
- **GitHub Issues**: Report bugs and feature requests
- **Support Email**: For enterprise customers

## 💡 Tips and Best Practices

### Project Organization

- **Use Descriptive Names**: Clear project and file names
- **Organize by Purpose**: Group related projects
- **Regular Cleanup**: Archive or delete unused projects
- **Documentation**: Maintain good README files

### Working with AI Assistants

- **Be Specific**: Provide clear, detailed prompts
- **Context Matters**: Reference relevant files and code
- **Iterate**: Refine prompts based on responses
- **Verify Output**: Always review AI-generated code

### Security Best Practices

- **Principle of Least Privilege**: Use safe mode when possible
- **Regular Audits**: Review security logs periodically
- **Secure Credentials**: Use environment variables for secrets
- **Update Regularly**: Keep adapters and platform current

### Performance Optimization

- **Close Unused Tabs**: Limit open terminal tabs
- **Clear History**: Periodically clear long conversations
- **Resource Monitoring**: Watch CPU and memory usage
- **Network Efficiency**: Use local models when available

### Collaboration

- **Share Projects Safely**: Review what you're sharing
- **Use Version Control**: Commit changes regularly
- **Document Decisions**: Use commit messages and comments
- **Code Reviews**: Have others review important changes

### Keyboard Shortcuts

Learn these shortcuts for efficiency:

- **Ctrl/Cmd + Enter**: Execute command in terminal
- **Ctrl/Cmd + L**: Clear terminal
- **Ctrl/Cmd + R**: Refresh interface
- **Ctrl/Cmd + ,**: Open settings
- **Ctrl/Cmd + K**: Focus terminal input
- **Tab**: Auto-complete commands
- **↑/↓**: Navigate command history

## 📚 Additional Resources

### Learning Resources

- **Platform Documentation**: Complete technical documentation
- **Video Tutorials**: Step-by-step video guides
- **Example Projects**: Sample projects to learn from
- **Blog Posts**: Tips, tricks, and use cases

### Community

- **Discord Server**: Real-time chat with other users
- **GitHub Discussions**: Long-form discussions and Q&A
- **Reddit Community**: User-generated content and tips
- **Twitter**: Follow [@VibeCodeDev](https://twitter.com/VibeCodeDev) for updates

### Support Channels

- **Self-Help**: This guide and documentation
- **Community Support**: Forums and chat
- **GitHub Issues**: Bug reports and feature requests
- **Enterprise Support**: Dedicated support for enterprise customers

---

## 🎉 You're Ready to Go!

Congratulations! You now have a comprehensive understanding of Vibe Code. Start by creating your first project and exploring the features. Remember:

- **Start Simple**: Begin with a basic project and safe mode
- **Experiment**: Try different adapters and features
- **Ask for Help**: Use the community resources when stuck
- **Share**: Contribute back by sharing your experiences

Happy coding with AI! 🚀

---

_Last updated: [Current Date]_
_Version: [Current Version]_
