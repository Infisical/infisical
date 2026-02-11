import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { useCreatePamWebAccessTicket } from "@app/hooks/api/pam";

import { WebSocketServerMessageSchema, WsMessageType } from "./web-access-types";

import "@xterm/xterm/css/xterm.css";

type UseWebAccessSessionOptions = {
  accountId: string;
  projectId: string;
  onSessionEnd?: () => void;
};

export const useWebAccessSession = ({
  accountId,
  projectId,
  onSessionEnd
}: UseWebAccessSessionOptions) => {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const inputBufferRef = useRef("");
  const currentPromptRef = useRef("");
  const createTicket = useCreatePamWebAccessTicket();

  const onSessionEndRef = useRef(onSessionEnd);
  const createTicketRef = useRef(createTicket);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
    createTicketRef.current = createTicket;
  }, [onSessionEnd, createTicket]);

  // --- WebSocket lifecycle (imperative) ---

  const connect = useCallback(async () => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    inputBufferRef.current = "";
    currentPromptRef.current = "";

    try {
      const ticket = await createTicketRef.current.mutateAsync({ accountId, projectId });

      const { protocol, host } = window.location;
      const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/web-access?ticket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        let raw: unknown;
        try {
          raw = JSON.parse(event.data as string);
        } catch {
          return;
        }
        const parsed = WebSocketServerMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const msg = parsed.data;

        if (msg.type === WsMessageType.Ready) {
          setIsConnected(true);
          setTimeout(() => terminal.focus(), 100);
        }

        if (msg.type === WsMessageType.SessionEnd) {
          terminal.write(`\r\n${msg.reason.replace(/\r?\n/g, "\r\n")}\r\n`);
          return;
        }

        if (msg.data) {
          terminal.write(msg.data.replace(/\r?\n/g, "\r\n"));
        }
        if (msg.prompt) {
          currentPromptRef.current = msg.prompt;
          terminal.write(msg.prompt);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setIsConnected(false);
        onSessionEndRef.current?.();
      };

      ws.onerror = () => {
        // no-op: onclose always fires after onerror
      };
    } catch {
      terminal.write("\r\nFailed to connect. Please close and try again.\r\n");
    }
  }, [accountId, projectId]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;

    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: WsMessageType.Control, data: "quit" }));
      }
      ws.close();
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    terminalRef.current?.clear();
    connect();
  }, [disconnect, connect]);

  // --- Terminal lifecycle (effect, tied to containerEl) ---

  useEffect(() => {
    if (!containerEl || !accountId) return undefined;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
        cursorAccent: "#0d1117",
        selectionBackground: "#264f78",
        black: "#0d1117",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#76e3ea",
        white: "#c9d1d9",
        brightBlack: "#484f58",
        brightRed: "#ffa198",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#b3f0ff",
        brightWhite: "#f0f6fc"
      },
      scrollback: 10000,
      allowProposedApi: true
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerEl);
    fitAddon.fit();
    terminalRef.current = terminal;

    // Wire terminal keyboard input — reads wsRef/inputBufferRef/currentPromptRef dynamically
    terminal.onData((data) => {
      if (data === "\r") {
        terminal.write("\r\n");
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: WsMessageType.Input, data: inputBufferRef.current })
          );
        }
        inputBufferRef.current = "";
      } else if (data === "\x7f") {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          terminal.write("\b \b");
        }
      } else if (data === "\x03") {
        terminal.write("^C\r\n");
        inputBufferRef.current = "";
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: WsMessageType.Control, data: "clear-buffer" }));
        }
        terminal.write(currentPromptRef.current);
      } else if (data >= " " || data === "\t") {
        const normalized = data.replace(/\r\n|\r/g, "\n");
        inputBufferRef.current += normalized;
        terminal.write(normalized.replace(/\n/g, "\r\n"));
      }
    });

    // Resize handling
    const handleResize = () => fitAddon.fit();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerEl);
    window.addEventListener("resize", handleResize);

    // Auto-connect
    connect();

    return () => {
      terminalRef.current = null;
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      disconnect();
      terminal.dispose();
      setIsConnected(false);
    };
  }, [containerEl, accountId, connect, disconnect]);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerEl(node);
  }, []);

  return { containerRef, isConnected, disconnect, reconnect };
};
