import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export function Terminal() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm>();
  const fitAddonRef = useRef<FitAddon>();

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal
    const terminal = new XTerm({
      theme: {
        background: '#1a1a1a',
        foreground: '#ffffff',
        cursor: '#ffffff',
      },
      fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Sample content
    terminal.writeln('Welcome to Vibe Code Terminal');
    terminal.writeln(`Session ID: ${sessionId}`);
    terminal.writeln('Connecting to AI coding assistant...');
    terminal.write('\r\n$ ');

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, [sessionId]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 p-4">
        <div
          ref={terminalRef}
          className="h-full w-full bg-gray-900 rounded-lg"
        />
      </div>
    </div>
  );
}