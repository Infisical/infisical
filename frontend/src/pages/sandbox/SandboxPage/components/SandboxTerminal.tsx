import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { TerminalIcon } from "lucide-react";
import { Readline } from "xterm-readline";

import { execInSandbox } from "@app/hooks/api/sandboxes";

import "@xterm/xterm/css/xterm.css";

type Props = {
  sandboxId: string;
  sandboxName: string;
  isRunning: boolean;
};

const THEME = {
  // Matches the panel it sits in. A different shade here draws a visible rectangle inside the panel.
  background: "#0e1114",
  foreground: "#c8ccd0",
  cursor: "#c8ccd0",
  black: "#0e1114",
  red: "#e5484d",
  green: "#30a46c",
  yellow: "#f5d90a",
  blue: "#0091ff",
  magenta: "#8e4ec6",
  cyan: "#00a2c7",
  white: "#c8ccd0",
  brightBlack: "#7e868c"
};

const toCrlf = (value: string) => value.replace(/\r?\n/g, "\r\n");

const resolveErrorMessage = (error: unknown) => {
  const serverMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  if (serverMessage) return serverMessage;
  return error instanceof Error ? error.message : "Command failed";
};

const isSandboxStoppedError = (error: unknown) =>
  Boolean(resolveErrorMessage(error).includes("not running"));

export const SandboxTerminal = ({ sandboxId, sandboxName, isRunning }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !isRunning) return undefined;

    // Scoped to this effect run, not a shared ref: a loop parked on an in-flight exec must not see a
    // later mount's flag and resume writing into a terminal that has already been disposed.
    let isActive = true;

    const terminal = new Terminal({
      theme: THEME,
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 12,
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000
    });

    const fitAddon = new FitAddon();
    const readline = new Readline();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.loadAddon(readline);
    terminal.open(containerRef.current);
    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(containerRef.current);

    terminal.writeln(`\x1b[90mInfisical Sandbox \x1b[0m\x1b[1m${sandboxName}\x1b[0m`);
    terminal.writeln(
      "\x1b[90mNo credentials are present in this environment. Granted resources are brokered.\x1b[0m"
    );
    terminal.writeln("");

    const buildPrompt = (cwd: string) => `\x1b[36m${cwd}\x1b[0m \x1b[90m$\x1b[0m `;

    const runLoop = async () => {
      let cwd = "~";

      while (isActive) {
        let line: string;
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential shell read loop
          line = await readline.read(buildPrompt(cwd));
        } catch {
          break;
        }

        const command = line.trim();

        if (command === "clear") {
          terminal.clear();
        } else if (command) {
          try {
            // eslint-disable-next-line no-await-in-loop -- one command at a time, by design
            const result = await execInSandbox(sandboxId, command);
            if (!isActive) break;

            if (result.stdout) readline.println(toCrlf(result.stdout.replace(/\n$/, "")));
            if (result.stderr)
              readline.println(`\x1b[31m${toCrlf(result.stderr.replace(/\n$/, ""))}\x1b[0m`);
            if (result.timedOut) readline.println("\x1b[33mCommand timed out after 30s\x1b[0m");
            if (result.wasTruncated) readline.println("\x1b[33mOutput truncated\x1b[0m");
            if (!result.stdout && !result.stderr && result.exitCode !== 0) {
              readline.println(`\x1b[90mexit ${result.exitCode}\x1b[0m`);
            }

            cwd = result.cwd;
          } catch (error) {
            readline.println(`\x1b[31m${resolveErrorMessage(error)}\x1b[0m`);

            // The runtime lives in the API process, so a restart silently stops every sandbox. Stop
            // reading rather than letting the user type into a shell that can no longer answer.
            if (isSandboxStoppedError(error)) {
              readline.println("\x1b[33mStart the sandbox again to reconnect.\x1b[0m");
              break;
            }
          }
        }
      }
    };

    runLoop().catch(() => {
      // the loop only rejects when the terminal is torn down mid-read
    });

    return () => {
      isActive = false;
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [sandboxId, sandboxName, isRunning]);

  if (!isRunning) {
    return (
      // No panel of its own: matches the file tree beside it, which now draws on the card. Same
      // ringed glyph and two-line shape as the dashboard's activity placeholder.
      <div className="flex h-[calc(100vh-24rem)] min-h-[300px] flex-col items-center justify-center gap-2 text-center">
        <span className="flex size-9 items-center justify-center rounded-full border border-border bg-container">
          <TerminalIcon className="size-4 text-muted" />
        </span>
        <p className="text-sm text-foreground">Sandbox is stopped</p>
        <p className="text-xs text-muted">Start it to open a shell.</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-lg bg-[#0e1114] p-2.5">
      <div
        ref={containerRef}
        className="h-[calc(100vh-24rem)] min-h-[300px] [&_.xterm-viewport]:thin-scrollbar"
        style={{ minHeight: 0 }}
      />
    </div>
  );
};
