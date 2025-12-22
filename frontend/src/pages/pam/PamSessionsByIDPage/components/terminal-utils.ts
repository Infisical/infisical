import { TTerminalEvent } from "@app/hooks/api/pam";

// Strip ANSI escape codes from terminal output
export const stripAnsiCodes = (text: string): string => {
  // Remove ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\][0-9];[^\x07]*\x07/g, "");
};

export type AggregatedTerminalEvent = {
  timestamp: string;
  eventType: string;
  data: string;
  elapsedTime: number;
  eventCount: number;
};

// Aggregate consecutive output events to avoid character-by-character display
export const aggregateTerminalEvents = (events: TTerminalEvent[]): AggregatedTerminalEvent[] => {
  // Filter to only show output events (input is echoed, so redundant)
  const outputEvents = events.filter((e) => e.eventType === "output");

  if (outputEvents.length === 0) return [];

  // Decode each event and track character positions to map back to original events
  const decodedEvents: { text: string; event: TTerminalEvent }[] = outputEvents.map((e) => {
    try {
      return { text: stripAnsiCodes(atob(e.data)), event: e };
    } catch {
      return { text: "", event: e };
    }
  });

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
    const originalEvent = decodedEvents[eventIndex]?.event ?? outputEvents[0];

    return {
      timestamp: originalEvent.timestamp,
      eventType: "output",
      data: segment.text,
      elapsedTime: originalEvent.elapsedTime,
      eventCount: 1
    };
  });
};
