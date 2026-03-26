import { TTerminalEvent } from "@app/hooks/api/pam";

// Strip ANSI escape codes from terminal output
export const stripAnsiCodes = (text: string): string => {
  // Remove ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\][0-9];[^\x07]*\x07/g, "");
};

// Check if a string contains mostly printable characters
const isPrintableText = (text: string): boolean => {
  if (text.length === 0) return false;
  let printableCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    // Allow printable ASCII, newlines, tabs, and common unicode
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9 || code > 127) {
      printableCount += 1;
    }
  }
  // Consider it printable if at least 80% of characters are printable
  return printableCount / text.length >= 0.8;
};

export type AggregatedTerminalEvent = {
  timestamp: string;
  eventType: string;
  data: string;
  elapsedTime: number;
  eventCount: number;
};

// Decode a single event's base64 data, returning empty string on failure or binary data
const decodeEventData = (event: TTerminalEvent): string => {
  try {
    const decoded = stripAnsiCodes(atob(event.data));
    if (!isPrintableText(decoded)) {
      return "";
    }
    return decoded;
  } catch {
    return "";
  }
};

// Check if input is echoed in output (common in interactive terminal sessions)
const isInputEchoedInOutput = (events: TTerminalEvent[]): boolean => {
  const inputEvents = events.filter((e) => e.eventType === "input");
  const outputEvents = events.filter((e) => e.eventType === "output");

  if (inputEvents.length === 0 || outputEvents.length === 0) return false;

  // Decode all output into a single string
  const allOutput = outputEvents.map((e) => decodeEventData(e)).join("");

  // Check if all non-empty inputs appear in the output (echoed)
  // If any input is not echoed, return false (likely exec or SFTP)
  const hasUnechoedInput = inputEvents.some((inputEvent) => {
    const inputText = decodeEventData(inputEvent).trim();
    return inputText && !allOutput.includes(inputText);
  });

  return !hasUnechoedInput;
};

// Aggregate consecutive output events to avoid character-by-character display
export const aggregateTerminalEvents = (events: TTerminalEvent[]): AggregatedTerminalEvent[] => {
  // Determine if input is echoed in output (interactive terminal vs exec/SFTP)
  const inputEchoed = isInputEchoedInOutput(events);

  // If input is echoed, only show output to avoid duplication
  // Otherwise, include both input and output (for exec, SFTP, etc.)
  let terminalEvents = inputEchoed
    ? events.filter((e) => e.eventType === "output")
    : events.filter((e) => e.eventType === "input" || e.eventType === "output");

  // Fall back to input events if no output events (e.g., SFTP with only input messages)
  if (terminalEvents.length === 0) {
    terminalEvents = events.filter((e) => e.eventType === "input");
  }

  if (terminalEvents.length === 0) return [];

  // Decode each event and filter out binary/non-printable data
  const decodedEvents: { text: string; event: TTerminalEvent }[] = terminalEvents
    .map((e) => ({ text: decodeEventData(e), event: e }))
    .filter((e) => e.text.length > 0);

  if (decodedEvents.length === 0) return [];

  // Build a character-to-event index mapping
  // This tracks which original event each character came from
  const charToEventIndex: number[] = [];
  decodedEvents.forEach((decoded, eventIndex) => {
    for (let i = 0; i < decoded.text.length; i += 1) {
      charToEventIndex.push(eventIndex);
    }
  });

  const allText = decodedEvents.map((d) => d.text).join("");

  // Split on lines that contain shell prompts
  // Pattern matches: user@hostname:path# or user@hostname:path$
  const promptPattern = /^[\w-]+@[\w-]+[^\s]*[:#$]\s+/;

  const lines = allText.split("\n");
  const segments: { text: string; startCharIndex: number }[] = [];
  let currentSegmentLines: string[] = [];
  let currentSegmentStartChar = 0;
  let currentCharIndex = 0;

  lines.forEach((line, lineIndex) => {
    const hasPrompt = promptPattern.test(line);

    if (hasPrompt && currentSegmentLines.length > 0) {
      // Found a new prompt, save current segment and start new one
      segments.push({
        text: currentSegmentLines.join("\n"),
        startCharIndex: currentSegmentStartChar
      });
      currentSegmentLines = [line];
      currentSegmentStartChar = currentCharIndex;
    } else {
      // Add line to current segment
      currentSegmentLines.push(line);
    }

    // Account for line length + newline character (except for last line)
    currentCharIndex += line.length + (lineIndex < lines.length - 1 ? 1 : 0);
  });

  // Add the last segment
  if (currentSegmentLines.length > 0) {
    segments.push({
      text: currentSegmentLines.join("\n"),
      startCharIndex: currentSegmentStartChar
    });
  }

  // Filter out empty segments and convert to aggregated events
  const validSegments = segments.filter((seg) => seg.text.trim().length > 0);

  return validSegments.map((segment) => {
    // Find the original event that corresponds to the start of this segment
    const eventIndex = charToEventIndex[segment.startCharIndex] ?? 0;
    const originalEvent = decodedEvents[eventIndex]?.event ?? terminalEvents[0];

    return {
      timestamp: originalEvent.timestamp,
      eventType: "output",
      data: segment.text,
      elapsedTime: originalEvent.elapsedTime,
      eventCount: 1
    };
  });
};
