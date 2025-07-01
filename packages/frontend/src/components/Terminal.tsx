import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useTerminal } from '../hooks/useTerminal';
import 'xterm/css/xterm.css';

export function Terminal() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || 'default-project';
  const adapter = searchParams.get('adapter') || 'claude-code';
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm>();
  const fitAddonRef = useRef<FitAddon>();
  const [connected, setConnected] = useState(false);

  const terminal = useTerminal({
    projectId,
    adapter,
    onConnect: () => setConnected(true),
    onDisconnect: () => setConnected(false),
    onError: (error) => {
      console.error('Terminal error:', error);
      if (xtermRef.current) {
        xtermRef.current.writeln(`\r\nError: ${error}`);
      }
    },
  });

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal
    const xterm = new XTerm({
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#ffffff',
        selection: '#ffffff40',
      },
      fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      allowTransparency: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Welcome message
    xterm.writeln('🚀 Welcome to Vibe Code Terminal');
    xterm.writeln(`Project: ${projectId}`);
    xterm.writeln(`Adapter: ${adapter}`);
    xterm.writeln('Connecting to AI coding assistant...');
    xterm.writeln('');

    // Set up data handler for WebSocket
    terminal.setDataHandler((data: string) => {
      xterm.write(data);
    });

    // Handle user input
    xterm.onData((data) => {
      terminal.sendInput(data);
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      const { cols, rows } = xterm;
      terminal.resize(cols, rows);
    };

    window.addEventListener('resize', handleResize);

    // Initial resize
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
    };
  }, []);

  // Update terminal when connection status changes
  useEffect(() => {
    if (xtermRef.current) {
      if (connected) {
        xtermRef.current.writeln('✅ Connected! Ready to code with AI assistance.');
        xtermRef.current.write('\r\n$ ');
      } else {
        xtermRef.current.writeln('❌ Disconnected from server.');
      }
    }
  }, [connected]);

  const handleQuickCommand = (command: string) => {
    if (xtermRef.current) {
      xtermRef.current.writeln(`\r\n> ${command}`);
    }
    terminal.executeCommand(command);
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Terminal Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-sm text-gray-300">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="text-sm text-gray-400">
            {projectId} • {adapter}
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleQuickCommand('help')}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
          >
            Help
          </button>
          <button
            onClick={() => handleQuickCommand('ls')}
            className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-2 py-1 rounded"
          >
            List Files
          </button>
          <button
            onClick={() => terminal.kill()}
            className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
          >
            Kill Session
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 p-4">
        <div
          ref={terminalRef}
          className="h-full w-full bg-gray-900 rounded-lg border border-gray-700 focus-within:border-blue-500 transition-colors"
        />
      </div>

      {/* Terminal Footer */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div>
            Session: {terminal.session.id || 'Not connected'}
          </div>
          <div className="flex items-center space-x-4">
            <span>Ctrl+C to interrupt</span>
            <span>Type 'help' for assistance</span>
          </div>
        </div>
      </div>
    </div>
  );
}