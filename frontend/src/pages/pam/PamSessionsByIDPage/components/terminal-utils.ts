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

  // First, combine all events into one string to process
  const allText = outputEvents
    .map((e) => {
      try {
        return stripAnsiCodes(atob(e.data));
      } catch {
        return "";
      }
    })
    .join("");

  // Split on lines that contain shell prompts
  // Pattern matches: user@hostname:path# or user@hostname:path$
  const promptPattern = /^[\w-]+@[\w-]+[^\s]*[:#$]\s+/;

  const lines = allText.split("\n");
  const segments: string[] = [];
  let currentSegment: string[] = [];

  lines.forEach((line) => {
    const hasPrompt = promptPattern.test(line);

    if (hasPrompt && currentSegment.length > 0) {
      // Found a new prompt, save current segment and start new one
      segments.push(currentSegment.join("\n"));
      currentSegment = [line];
    } else {
      // Add line to current segment
      currentSegment.push(line);
    }
  });

  // Add the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment.join("\n"));
  }

  // Filter out empty segments and convert to aggregated events
  const validSegments = segments.filter((seg) => seg.trim().length > 0);

  return validSegments.map((segment) => ({
    timestamp: outputEvents[0].timestamp,
    eventType: "output",
    data: segment,
    elapsedTime: outputEvents[0].elapsedTime,
    eventCount: Math.ceil(outputEvents.length / validSegments.length)
  }));
};
