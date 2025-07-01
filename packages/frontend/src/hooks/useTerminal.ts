import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseTerminalOptions {
  projectId: string;
  adapter: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

interface TerminalSession {
  id: string | null;
  connected: boolean;
  error: string | null;
}

export function useTerminal(options: UseTerminalOptions) {
  const [session, setSession] = useState<TerminalSession>({
    id: null,
    connected: false,
    error: null,
  });
  
  const socketRef = useRef<Socket | null>(null);
  const dataHandlerRef = useRef<((data: string) => void) | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const socket = io({
      autoConnect: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to WebSocket');
      setSession(prev => ({ ...prev, connected: true, error: null }));
      options.onConnect?.();

      // Create terminal session
      socket.emit('terminal:create', {
        projectId: options.projectId,
        adapter: options.adapter,
        cols: 80,
        rows: 24,
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket');
      setSession(prev => ({ ...prev, connected: false }));
      options.onDisconnect?.();
    });

    socket.on('terminal:created', (data) => {
      console.log('Terminal session created:', data.sessionId);
      setSession(prev => ({ ...prev, id: data.sessionId }));
    });

    socket.on('terminal:data', (data) => {
      if (dataHandlerRef.current) {
        dataHandlerRef.current(data.data);
      }
    });

    socket.on('terminal:error', (data) => {
      console.error('Terminal error:', data.error);
      setSession(prev => ({ ...prev, error: data.error }));
      options.onError?.(data.error);
    });

    socket.on('terminal:exit', (data) => {
      console.log('Terminal session ended:', data.exitCode);
      setSession(prev => ({ ...prev, id: null }));
    });

    return () => {
      socket.disconnect();
    };
  }, [options.projectId, options.adapter]);

  const sendInput = (input: string) => {
    if (socketRef.current && session.id) {
      socketRef.current.emit('terminal:input', {
        sessionId: session.id,
        input,
      });
    }
  };

  const executeCommand = (command: string) => {
    if (socketRef.current && session.id) {
      socketRef.current.emit('terminal:execute', {
        sessionId: session.id,
        command,
      });
    }
  };

  const resize = (cols: number, rows: number) => {
    if (socketRef.current && session.id) {
      socketRef.current.emit('terminal:resize', {
        sessionId: session.id,
        cols,
        rows,
      });
    }
  };

  const kill = () => {
    if (socketRef.current && session.id) {
      socketRef.current.emit('terminal:kill', {
        sessionId: session.id,
      });
    }
  };

  const setDataHandler = (handler: (data: string) => void) => {
    dataHandlerRef.current = handler;
  };

  return {
    session,
    sendInput,
    executeCommand,
    resize,
    kill,
    setDataHandler,
  };
}