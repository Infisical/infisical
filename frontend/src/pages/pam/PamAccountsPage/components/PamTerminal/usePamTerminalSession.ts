import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { useCreatePamTerminalTicket } from "@app/hooks/api/pam";

import { WebSocketServerMessageSchema, WsMessageType } from "./pam-terminal-types";

import "@xterm/xterm/css/xterm.css";

type UsePamTerminalSessionOptions = {
  accountId: string;
  projectId: string;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
};

export const usePamTerminalSession = ({
  accountId,
  projectId,
  onSessionStart,
  onSessionEnd
}: UsePamTerminalSessionOptions) => {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const createTicket = useCreatePamTerminalTicket();

  const onSessionStartRef = useRef(onSessionStart);
  const onSessionEndRef = useRef(onSessionEnd);
  const createTicketRef = useRef(createTicket);

  useEffect(() => {
    onSessionStartRef.current = onSessionStart;
    onSessionEndRef.current = onSessionEnd;
    createTicketRef.current = createTicket;
  }, [onSessionStart, onSessionEnd, createTicket]);

  // Main lifecycle effect — fires when containerEl becomes non-null
  useEffect(() => {
    if (!containerEl || !accountId) return undefined;

    let disposed = false;
    const inputBuffer = { current: "" };
    const currentPrompt = { current: "" };

    // 1. Create terminal
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

    // 2. Wire terminal keyboard input
    terminal.onData((data) => {
      // Enter — submit the current input buffer
      if (data === "\r") {
        terminal.write("\r\n");
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: WsMessageType.Input, data: inputBuffer.current })
          );
        }
        inputBuffer.current = "";
        // Backspace — erase the last character
      } else if (data === "\x7f") {
        if (inputBuffer.current.length > 0) {
          inputBuffer.current = inputBuffer.current.slice(0, -1);
          terminal.write("\b \b");
        }
        // Ctrl+C — cancel the current input
      } else if (data === "\x03") {
        terminal.write("^C\r\n");
        inputBuffer.current = "";
        terminal.write(currentPrompt.current);
        // Printable characters and tab — append to input buffer
      } else if (data >= " " || data === "\t") {
        // Normalize embedded newlines from paste
        const normalized = data.replace(/\r\n|\r/g, "\n");
        inputBuffer.current += normalized;
        terminal.write(normalized.replace(/\n/g, "\r\n"));
      }
    });

    // 3. Resize handling
    const handleResize = () => fitAddon.fit();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerEl);
    window.addEventListener("resize", handleResize);

    // 4. Create ticket and open WebSocket
    const startSession = async () => {
      try {
        if (disposed) return;
        const ticket = await createTicketRef.current.mutateAsync({ accountId, projectId });
        if (disposed) return;

        const { protocol, host } = window.location;
        const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${host}/api/v1/pam/accounts/${accountId}/terminal-access?ticket=${encodeURIComponent(ticket)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          if (disposed) return;
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
            onSessionStartRef.current?.();
            setTimeout(() => terminal.focus(), 100);
          }

          // Write directly to terminal — no indirection
          if (msg.data) {
            // xterm requires \r\n; bare \n moves the cursor down without returning to column 0
            terminal.write(msg.data.replace(/\r?\n/g, "\r\n"));
          }
          if (msg.prompt) {
            currentPrompt.current = msg.prompt;
            terminal.write(msg.prompt);
          }
        };

        ws.onclose = () => {
          if (disposed) return;
          wsRef.current = null;
          setIsConnected(false);
          onSessionEndRef.current?.();
        };

        ws.onerror = () => {
          // no-op: onclose always fires after onerror
        };
      } catch {
        if (!disposed) {
          terminal.write("\r\nFailed to connect. Please close and try again.\r\n");
        }
      }
    };

    startSession();

    // 5. Cleanup
    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();

      const ws = wsRef.current;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: WsMessageType.Control, data: "quit" }));
        }
        ws.close();
        wsRef.current = null;
      }

      terminal.dispose();
      setIsConnected(false);
    };
  }, [containerEl, accountId, projectId]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;

    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: WsMessageType.Control, data: "quit" }));
      }
      ws.close();
    }

    setIsConnected(false);
    onSessionEndRef.current?.();
  }, []);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerEl(node);
  }, []);

  return { containerRef, isConnected, disconnect };
};
