import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";

import { apiRequest } from "@app/config/request";
import { MfaSessionStatus, TMfaSessionStatusResponse } from "@app/hooks/api/mfaSession/types";

import { WebSocketServerMessageSchema, WsMessageType } from "./web-access-types";

import "@xterm/xterm/css/xterm.css";

type UseWebAccessSessionOptions = {
  accountId: string;
  projectId: string;
  orgId: string;
  resourceName: string;
  accountName: string;
  onSessionEnd?: () => void;
};

export const useWebAccessSession = ({
  accountId,
  projectId,
  orgId,
  resourceName,
  accountName,
  onSessionEnd
}: UseWebAccessSessionOptions) => {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const inputBufferRef = useRef("");
  const currentPromptRef = useRef("");
  const promptCallbackRef = useRef<((input: string) => void) | null>(null);

  const onSessionEndRef = useRef(onSessionEnd);

  useEffect(() => {
    onSessionEndRef.current = onSessionEnd;
  }, [onSessionEnd]);

  // --- WebSocket lifecycle (imperative) ---

  const openWebSocket = useCallback(
    (terminal: Terminal, ticket: string) => {
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
        if (terminalRef.current) {
          terminalRef.current.options.disableStdin = true;
        }
        setIsConnected(false);
        onSessionEndRef.current?.();
      };

      ws.onerror = () => {
        // no-op: onclose always fires after onerror
      };
    },
    [accountId]
  );

  const connect = useCallback(async () => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    inputBufferRef.current = "";
    currentPromptRef.current = "";

    const prompt = (message: string): Promise<string> => {
      return new Promise((resolve) => {
        terminal.write(message);
        promptCallbackRef.current = resolve;
      });
    };

    try {
      const { data } = await apiRequest.post<{ ticket: string }>(
        `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
        { projectId }
      );
      terminal.reset();
      openWebSocket(terminal, data.ticket);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          data?: {
            error?: string;
            details?: {
              mfaSessionId?: string;
              mfaMethod?: string;
              policyId?: string;
              policyName?: string;
              policyType?: string;
            };
          };
        };
      };

      if (axiosErr?.response?.data?.error === "SESSION_MFA_REQUIRED") {
        const mfaSessionId = axiosErr.response!.data!.details?.mfaSessionId;

        if (!mfaSessionId) {
          terminal.write("\r\nMFA session could not be created. Please try again.\r\n");
          return;
        }

        const mfaUrl = `${window.location.origin}/mfa-session/${mfaSessionId}`;

        // Try to open MFA verification in a new window.
        const popup = window.open(mfaUrl, "_blank");

        terminal.write(
          "\r\nMFA verification required. Complete verification in the opened window or via this link:\r\n"
        );
        terminal.write(`\r\n  ${mfaUrl}\r\n\r\n`);
        terminal.write("Waiting for verification...\r\n");

        // Poll for MFA session to become ACTIVE
        const MFA_POLL_INTERVAL = 2000;
        const MFA_TIMEOUT = 5 * 60 * 1000; // 5 minutes
        const startTime = Date.now();

        const mfaVerified = await new Promise<boolean>((resolve) => {
          const interval = setInterval(async () => {
            if (Date.now() - startTime > MFA_TIMEOUT) {
              clearInterval(interval);
              resolve(false);
              return;
            }

            try {
              const resp = await apiRequest.get<TMfaSessionStatusResponse>(
                `/api/v2/mfa-sessions/${mfaSessionId}/status`
              );
              if (resp.data.status === MfaSessionStatus.ACTIVE) {
                clearInterval(interval);
                resolve(true);
              }
            } catch {
              clearInterval(interval);
              resolve(false);
            }
          }, MFA_POLL_INTERVAL);
        });

        // Close popup if still open
        if (popup && !popup.closed) {
          popup.close();
        }

        if (!mfaVerified) {
          terminal.write("\r\nMFA verification timed out or failed. Please try again.\r\n");
          return;
        }

        // Retry ticket request with verified MFA session
        try {
          terminal.reset();
          const { data: retryData } = await apiRequest.post<{ ticket: string }>(
            `/api/v1/pam/accounts/${accountId}/web-access-ticket`,
            { projectId, mfaSessionId }
          );
          openWebSocket(terminal, retryData.ticket);
        } catch {
          terminal.write("\r\nFailed to connect after MFA verification. Please try again.\r\n");
        }
        return;
      }

      // Check for PolicyViolationError
      if (axiosErr?.response?.data?.error === "PolicyViolationError") {
        const policyName = axiosErr.response!.data!.details?.policyName ?? "Unknown Policy";

        terminal.write(`\r\nThis account is protected by approval policy: "${policyName}"\r\n`);

        const answer = await prompt(
          "\r\nThis action requires approval. Would you like to create an approval request? [Y/n]: "
        );

        if (answer.trim().toLowerCase() === "n") {
          terminal.write("\r\nApproval request was not created.\r\n");
          await prompt("\r\nPress Enter to try again.");
          terminal.reset();
          connect();
          return;
        }

        const justification = await prompt(
          "\r\nEnter justification (optional, press Enter to skip): "
        );

        terminal.write("\r\nCreating approval request...\r\n");

        try {
          const { data: approvalData } = await apiRequest.post<{ request: { id: string } }>(
            "/api/v1/approval-policies/pam-access/requests",
            {
              projectId,
              requestData: {
                accessDuration: "1h",
                resourceName,
                accountName
              },
              justification: justification.trim() || undefined
            }
          );

          terminal.write("\r\nApproval request created successfully!\r\n");

          const approvalUrl = `${window.location.origin}/organizations/${orgId}/projects/pam/${projectId}/approval-requests/${approvalData.request.id}`;
          terminal.write(`View details at: ${approvalUrl}\r\n`);

          await prompt("\r\nOnce approved, press Enter to reconnect.");
          terminal.reset();
          connect();
        } catch (approvalErr: unknown) {
          const approvalAxiosErr = approvalErr as {
            response?: { data?: { message?: string } };
          };
          const errorMsg =
            approvalAxiosErr?.response?.data?.message ?? "Failed to create approval request.";
          terminal.write(`\r\n${errorMsg}\r\n`);
          await prompt("\r\nPress Enter to try again.");
          terminal.reset();
          connect();
        }
        return;
      }

      terminal.write("\r\nFailed to connect. Please close and try again.\r\n");
    }
  }, [accountId, projectId, orgId, resourceName, accountName, openWebSocket]);

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
    if (terminalRef.current) {
      terminalRef.current.reset();
      terminalRef.current.options.disableStdin = false;
    }
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
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerEl);
    fitAddon.fit();
    terminalRef.current = terminal;

    // Wire terminal keyboard input — reads wsRef/inputBufferRef/currentPromptRef dynamically
    terminal.onData((data) => {
      if (data === "\r") {
        terminal.write("\r\n");
        if (promptCallbackRef.current) {
          const cb = promptCallbackRef.current;
          promptCallbackRef.current = null;
          cb(inputBufferRef.current);
          inputBufferRef.current = "";
        } else if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: WsMessageType.Input, data: inputBufferRef.current })
          );
          inputBufferRef.current = "";
        }
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
