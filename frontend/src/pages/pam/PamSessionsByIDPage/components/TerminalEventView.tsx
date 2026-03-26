import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  faBackwardStep,
  faForwardStep,
  faPause,
  faPlay,
  faStepBackward,
  faStepForward
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import { Button, Spinner, Tooltip } from "@app/components/v2";
import { TTerminalEvent } from "@app/hooks/api/pam";

import "@xterm/xterm/css/xterm.css";

type Segment = {
  endEventIndex: number;
  timestamp: string;
  textContent: string;
};

type Props = {
  events: TTerminalEvent[];
};

const PLAYBACK_INTERVAL_MS = 800;

// Detect if text contains a shell prompt pattern
const hasPromptPattern = (text: string): boolean => {
  return /[\w-]+@[\w-]+[^\n]*[#$]\s*$/.test(text);
};

// Extract all text content from terminal buffer
const getTerminalContent = (terminal: Terminal): string => {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];
  const totalLines = buffer.baseY + buffer.cursorY + 1;

  for (let i = 0; i < totalLines; i += 1) {
    const line = buffer.getLine(i);
    if (line) {
      lines.push(line.translateToString(false));
    }
  }

  return lines.join("\r\n");
};

// Format non-terminal events (sftp) as displayable text for terminal view
const formatNonTerminalEvent = (event: TTerminalEvent, decoded: string): string => {
  if (event.channelType === "sftp") {
    return `\x1b[36m[SFTP] ${decoded.trim()}\x1b[0m\r\n`;
  }
  return decoded;
};

export const TerminalEventView = ({ events }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isProcessing, setIsProcessing] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // Separate terminal events from exec events
  const { terminalEvents, execEvents } = useMemo(() => {
    const terminal: TTerminalEvent[] = [];
    const exec: TTerminalEvent[] = [];

    events.forEach((e) => {
      if (e.channelType === "exec") {
        exec.push(e);
      } else if (!e.channelType || e.channelType === "terminal" || e.channelType === "sftp") {
        // Terminal output, sftp, or legacy data
        if (e.channelType === "sftp" || e.eventType === "output") {
          terminal.push(e);
        }
      }
    });

    return { terminalEvents: terminal, execEvents: exec };
  }, [events]);

  // Check if this is a pure exec session (no terminal events)
  const isPureExecSession = useMemo(() => {
    return terminalEvents.length === 0 && execEvents.length > 0;
  }, [terminalEvents.length, execEvents.length]);

  // Build exec content for pure exec sessions
  const execContent = useMemo(() => {
    if (!isPureExecSession) return "";

    let content = "";
    execEvents.forEach((event) => {
      try {
        const decoded = atob(event.data);
        content += decoded;
      } catch {
        // Skip invalid base64
      }
    });
    return content;
  }, [isPureExecSession, execEvents]);

  useEffect(() => {
    // For pure exec sessions, we don't use xterm - just create a single segment
    if (isPureExecSession) {
      if (execContent) {
        setSegments([
          {
            endEventIndex: execEvents.length - 1,
            timestamp: execEvents[execEvents.length - 1]?.timestamp || new Date().toISOString(),
            textContent: execContent
          }
        ]);
      }
      setIsProcessing(false);
      return undefined;
    }

    if (!containerRef.current || terminalEvents.length === 0) {
      setIsProcessing(false);
      return undefined;
    }

    const terminal = new Terminal({
      cursorBlink: false,
      fontSize: 13,
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
      disableStdin: true,
      cursorStyle: "block",
      cursorInactiveStyle: "block"
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    const computeSegments = async () => {
      setIsProcessing(true);
      const detectedSegments: Segment[] = [];
      let lastSegmentContent = "";

      for (let i = 0; i < terminalEvents.length; i += 1) {
        const event = terminalEvents[i];
        try {
          const decoded = atob(event.data);

          let content: string;
          if (event.channelType === "terminal" || !event.channelType) {
            content = decoded;
          } else {
            content = formatNonTerminalEvent(event, decoded);
          }

          // eslint-disable-next-line no-await-in-loop
          await new Promise<void>((resolve) => {
            terminal.write(content, resolve);
          });

          // For terminal sessions, segment by prompt pattern
          const buffer = terminal.buffer.active;
          const lastLineIndex = buffer.baseY + buffer.cursorY;
          const lastLine = buffer.getLine(lastLineIndex);
          const lastLineText = lastLine?.translateToString(true) || "";

          if (hasPromptPattern(lastLineText)) {
            const textContent = getTerminalContent(terminal);
            if (textContent !== lastSegmentContent) {
              detectedSegments.push({
                endEventIndex: i,
                timestamp: event.timestamp,
                textContent
              });
              lastSegmentContent = textContent;
            }
          }
        } catch {
          // Skip invalid base64
        }
      }

      // Always add final segment if needed
      if (terminalEvents.length > 0) {
        const lastIdx = terminalEvents.length - 1;
        const lastSegment = detectedSegments[detectedSegments.length - 1];
        const needsFinalSegment =
          detectedSegments.length === 0 || lastSegment.endEventIndex !== lastIdx;
        if (needsFinalSegment) {
          const textContent = getTerminalContent(terminal);
          if (textContent !== lastSegmentContent) {
            detectedSegments.push({
              endEventIndex: lastIdx,
              timestamp: terminalEvents[lastIdx].timestamp,
              textContent
            });
          }
        }
      }

      setSegments(detectedSegments);
      setCurrentSegmentIndex(0);

      if (detectedSegments.length > 0) {
        terminal.reset();
        terminal.write(detectedSegments[0].textContent);
      }

      setIsProcessing(false);
    };

    computeSegments();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalEvents, isPureExecSession, execContent, execEvents]);

  const restoreToSegment = useCallback(
    (segmentIndex: number) => {
      const terminal = terminalRef.current;
      if (!terminal || segmentIndex < 0 || segmentIndex >= segments.length) return;

      const segment = segments[segmentIndex];
      terminal.reset();
      terminal.write(segment.textContent);
    },
    [segments]
  );

  const prevSegmentIndexRef = useRef(0);
  useEffect(() => {
    if (
      !isProcessing &&
      segments.length > 0 &&
      terminalRef.current &&
      prevSegmentIndexRef.current !== currentSegmentIndex
    ) {
      restoreToSegment(currentSegmentIndex);
      prevSegmentIndexRef.current = currentSegmentIndex;
    }
  }, [currentSegmentIndex, isProcessing, restoreToSegment, segments.length]);

  useEffect(() => {
    if (isPlaying && !isProcessing) {
      playbackIntervalRef.current = setInterval(() => {
        setCurrentSegmentIndex((prev) => {
          if (prev >= segments.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, PLAYBACK_INTERVAL_MS);
    } else if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, isProcessing, segments.length]);

  const goToStart = useCallback(() => {
    setIsPlaying(false);
    setCurrentSegmentIndex(0);
  }, []);

  const goToEnd = useCallback(() => {
    setIsPlaying(false);
    if (segments.length > 0) {
      setCurrentSegmentIndex(segments.length - 1);
    }
  }, [segments.length]);

  const goNext = useCallback(() => {
    setIsPlaying(false);
    if (currentSegmentIndex < segments.length - 1) {
      setCurrentSegmentIndex((prev) => prev + 1);
    }
  }, [currentSegmentIndex, segments.length]);

  const goPrev = useCallback(() => {
    setIsPlaying(false);
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex((prev) => prev - 1);
    }
  }, [currentSegmentIndex]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
    } else if (currentSegmentIndex >= segments.length - 1) {
      setCurrentSegmentIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
    }
  }, [isPlaying, currentSegmentIndex, segments.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessing) return;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToStart();
      } else if (e.key === "End") {
        e.preventDefault();
        goToEnd();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, goToStart, goToEnd, togglePlay, isProcessing]);

  const currentSegment = currentSegmentIndex >= 0 ? segments[currentSegmentIndex] : null;

  if (events.length === 0 || (terminalEvents.length === 0 && execEvents.length === 0)) {
    return (
      <div className="flex grow items-center justify-center text-bunker-300">
        <div className="text-center">
          <div className="mb-2">Terminal session logs are not yet available</div>
          <div className="text-xs text-bunker-400">
            Logs will be uploaded after the session duration has elapsed.
            <br />
            If logs do not appear after some time, please contact your Gateway administrators.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex grow flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tooltip content="Go to start (Home)">
            <Button
              variant="outline_bg"
              size="xs"
              onClick={goToStart}
              isDisabled={isProcessing || currentSegmentIndex <= 0}
            >
              <FontAwesomeIcon icon={faBackwardStep} />
            </Button>
          </Tooltip>
          <Tooltip content="Previous section (←)">
            <Button
              variant="outline_bg"
              size="xs"
              onClick={goPrev}
              isDisabled={isProcessing || currentSegmentIndex <= 0}
            >
              <FontAwesomeIcon icon={faStepBackward} />
            </Button>
          </Tooltip>

          <Tooltip content={isPlaying ? "Pause (Space)" : "Play (Space)"}>
            <Button
              variant="outline_bg"
              size="xs"
              onClick={togglePlay}
              isDisabled={isProcessing || segments.length === 0}
            >
              <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
            </Button>
          </Tooltip>

          <Tooltip content="Next section (→)">
            <Button
              variant="outline_bg"
              size="xs"
              onClick={goNext}
              isDisabled={isProcessing || currentSegmentIndex >= segments.length - 1}
            >
              <FontAwesomeIcon icon={faStepForward} />
            </Button>
          </Tooltip>
          <Tooltip content="Go to end (End)">
            <Button
              variant="outline_bg"
              size="xs"
              onClick={goToEnd}
              isDisabled={isProcessing || currentSegmentIndex >= segments.length - 1}
            >
              <FontAwesomeIcon icon={faForwardStep} />
            </Button>
          </Tooltip>

          {isProcessing && (
            <div className="ml-2 flex items-center gap-2 text-xs text-bunker-400">
              <Spinner size="xs" />
              <span>Processing...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-bunker-400">
          {!isProcessing && segments.length > 0 && (
            <>
              <span>
                Section {currentSegmentIndex + 1} of {segments.length}
              </span>
              {currentSegment && <span>{new Date(currentSegment.timestamp).toLocaleString()}</span>}
            </>
          )}
        </div>
      </div>

      {isPureExecSession ? (
        <pre
          className="grow overflow-auto rounded-md border border-mineshaft-700 bg-[#0d1117] p-4 font-mono text-sm text-bunker-200"
          style={{ minHeight: "400px", whiteSpace: "pre" }}
        >
          {currentSegment?.textContent}
        </pre>
      ) : (
        <div
          ref={containerRef}
          className="grow rounded-md border border-mineshaft-700 bg-[#0d1117] p-2 transition-opacity"
          style={{ minHeight: "400px", opacity: isProcessing ? 0 : 1 }}
        />
      )}
    </div>
  );
};
