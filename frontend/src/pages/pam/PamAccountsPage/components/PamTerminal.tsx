import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import type {
  PamTerminalApi,
  UsePamTerminalProps,
  WebSocketServerMessage
} from "./pam-terminal-types";
import { WsMessageType } from "./pam-terminal-types";

import "@xterm/xterm/css/xterm.css";

export const usePamTerminal = ({ onInput, onReady }: UsePamTerminalProps) => {
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef<string>("");
  const currentPromptRef = useRef<string>("=> ");
  const onInputRef = useRef(onInput);
  const onReadyRef = useRef(onReady);

  // Keep refs up to date
  useEffect(() => {
    onInputRef.current = onInput;
    onReadyRef.current = onReady;
  }, [onInput, onReady]);

  const writeToTerminal = useCallback((text: string) => {
    if (xtermRef.current) {
      // xterm.js requires \r\n for proper line breaks; bare \n only moves
      // the cursor down without returning to column 0, causing misaligned output.
      xtermRef.current.write(text.replace(/\r?\n/g, "\r\n"));
    }
  }, []);

  const writePrompt = useCallback((prompt: string) => {
    currentPromptRef.current = prompt;
    if (xtermRef.current) {
      xtermRef.current.write(prompt);
    }
  }, []);

  const handleMessage = useCallback(
    (message: WebSocketServerMessage) => {
      if (!xtermRef.current) return;

      switch (message.type) {
        case WsMessageType.Ready:
        case WsMessageType.Output:
          if (message.data) {
            writeToTerminal(message.data);
          }
          if (message.prompt) {
            writePrompt(message.prompt);
          }
          break;

        default:
          break;
      }
    },
    [writeToTerminal, writePrompt]
  );

  const clear = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  }, []);

  const focus = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.focus();
    }
  }, []);

  // Initialize terminal when container element is available
  useEffect(() => {
    if (!containerEl || xtermRef.current) return undefined;

    // Initialize terminal with dark theme matching Infisical
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

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input
    terminal.onData((data) => {
      // Handle special keys
      if (data === "\r") {
        // Enter key - send the current input
        terminal.write("\r\n");
        onInputRef.current(inputBufferRef.current);
        inputBufferRef.current = "";
      } else if (data === "\x7f") {
        // Backspace
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          terminal.write("\b \b");
        }
      } else if (data === "\x03") {
        // Ctrl+C - clear current input
        terminal.write("^C\r\n");
        inputBufferRef.current = "";
        terminal.write(currentPromptRef.current);
      } else if (data >= " " || data === "\t") {
        // Printable characters, tab, and pasted text (including multi-line)
        // Normalize any embedded newlines from paste so the buffer stores \n
        // and the terminal displays proper \r\n line breaks
        const normalized = data.replace(/\r\n|\r/g, "\n");
        inputBufferRef.current += normalized;
        terminal.write(normalized.replace(/\n/g, "\r\n"));
      }
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerEl);

    window.addEventListener("resize", handleResize);

    const api: PamTerminalApi = { handleMessage, writeToTerminal, clear, focus };
    onReadyRef.current?.(api);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [containerEl, handleMessage, writeToTerminal, clear, focus]);

  // Callback ref to capture when the div is mounted
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    setContainerEl(node);
  }, []);

  return {
    terminalElement: (
      <div
        className="h-full w-full overflow-hidden rounded-md bg-[#0d1117] p-2 [&_.xterm-viewport]:thin-scrollbar"
        style={{ minHeight: "300px" }}
      >
        <div ref={containerRefCallback} className="h-full w-full" />
      </div>
    ),
    handleMessage,
    writeToTerminal,
    clear,
    focus
  };
};
