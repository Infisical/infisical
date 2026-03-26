import { TerminalChannelType, TTerminalEvent } from "@app/hooks/api/pam";

// Strip ANSI escape codes from terminal output
export const stripAnsiCodes = (text: string): string => {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\][0-9];[^\x07]*\x07/g, "");
};

// Check if a string contains mostly printable characters
const isPrintableText = (text: string): boolean => {
  if (text.length === 0) return false;
  let printableCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if ((code >= 32 && code <= 126) || code === 10 || code === 13 || code === 9 || code > 127) {
      printableCount += 1;
    }
  }
  return printableCount / text.length >= 0.8;
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

export type AggregatedTerminalEvent = {
  timestamp: string;
  eventType: string;
  channelType?: string;
  data: string;
  elapsedTime: number;
  eventCount: number;
};

// Aggregate consecutive output events using prompt-based segmentation
const aggregateOutputEvents = (
  outputEvents: TTerminalEvent[],
  channelType?: string
): AggregatedTerminalEvent[] => {
  if (outputEvents.length === 0) return [];

  const decodedEvents: { text: string; event: TTerminalEvent }[] = outputEvents
    .map((e) => ({ text: decodeEventData(e), event: e }))
    .filter((e) => e.text.length > 0);

  if (decodedEvents.length === 0) return [];

  const charToEventIndex: number[] = [];
  decodedEvents.forEach((decoded, eventIndex) => {
    for (let i = 0; i < decoded.text.length; i += 1) {
      charToEventIndex.push(eventIndex);
    }
  });

  const allText = decodedEvents.map((d) => d.text).join("");
  const promptPattern = /^[\w-]+@[\w-]+[^\s]*[:#$]\s+/;

  const lines = allText.split("\n");
  const segments: { text: string; startCharIndex: number }[] = [];
  let currentSegmentLines: string[] = [];
  let currentSegmentStartChar = 0;
  let currentCharIndex = 0;

  lines.forEach((line, lineIndex) => {
    const hasPrompt = promptPattern.test(line);

    if (hasPrompt && currentSegmentLines.length > 0) {
      segments.push({
        text: currentSegmentLines.join("\n"),
        startCharIndex: currentSegmentStartChar
      });
      currentSegmentLines = [line];
      currentSegmentStartChar = currentCharIndex;
    } else {
      currentSegmentLines.push(line);
    }

    currentCharIndex += line.length + (lineIndex < lines.length - 1 ? 1 : 0);
  });

  if (currentSegmentLines.length > 0) {
    segments.push({
      text: currentSegmentLines.join("\n"),
      startCharIndex: currentSegmentStartChar
    });
  }

  const validSegments = segments.filter((seg) => seg.text.trim().length > 0);

  return validSegments.map((segment) => {
    const eventIndex = charToEventIndex[segment.startCharIndex] ?? 0;
    const originalEvent = decodedEvents[eventIndex]?.event ?? outputEvents[0];

    return {
      timestamp: originalEvent.timestamp,
      eventType: "output",
      channelType,
      data: segment.text,
      elapsedTime: originalEvent.elapsedTime,
      eventCount: 1
    };
  });
};

// Convert input events to aggregated format
const convertInputEvents = (
  inputEvents: TTerminalEvent[],
  channelType?: string
): AggregatedTerminalEvent[] => {
  const results: AggregatedTerminalEvent[] = [];

  inputEvents.forEach((event) => {
    const text = decodeEventData(event);
    if (text.trim()) {
      results.push({
        timestamp: event.timestamp,
        eventType: "input",
        channelType,
        data: text,
        elapsedTime: event.elapsedTime,
        eventCount: 1
      });
    }
  });

  return results;
};

// Process events that have channelType (new format)
const processEventsWithChannelType = (events: TTerminalEvent[]): AggregatedTerminalEvent[] => {
  const results: AggregatedTerminalEvent[] = [];

  // Group events by channelType
  const terminalEvents = events.filter((e) => e.channelType === TerminalChannelType.Terminal);
  const execEvents = events.filter((e) => e.channelType === TerminalChannelType.Exec);
  const sftpEvents = events.filter((e) => e.channelType === TerminalChannelType.Sftp);

  // Terminal: only show output (input is echoed)
  const terminalOutputs = terminalEvents.filter((e) => e.eventType === "output");
  results.push(...aggregateOutputEvents(terminalOutputs, TerminalChannelType.Terminal));

  // Exec: show both input (command) and output (result)
  const execInputs = execEvents.filter((e) => e.eventType === "input");
  const execOutputs = execEvents.filter((e) => e.eventType === "output");
  results.push(...convertInputEvents(execInputs, TerminalChannelType.Exec));
  results.push(...aggregateOutputEvents(execOutputs, TerminalChannelType.Exec));

  // SFTP: show only input messages (no meaningful output)
  const sftpInputs = sftpEvents.filter((e) => e.eventType === "input");
  results.push(...convertInputEvents(sftpInputs, TerminalChannelType.Sftp));

  // Sort by timestamp to maintain chronological order
  results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return results;
};

// Backwards compatibility: process legacy events without channelType
// Uses heuristic - only show output events (assumes interactive terminal)
const processLegacyEvents = (events: TTerminalEvent[]): AggregatedTerminalEvent[] => {
  const outputEvents = events.filter((e) => e.eventType === "output");

  // If there are output events, aggregate them (interactive terminal behavior)
  if (outputEvents.length > 0) {
    return aggregateOutputEvents(outputEvents);
  }

  // Fallback: if no output events, show input events (might be SFTP-like)
  const inputEvents = events.filter((e) => e.eventType === "input");
  return convertInputEvents(inputEvents);
};

// Main aggregation function
export const aggregateTerminalEvents = (events: TTerminalEvent[]): AggregatedTerminalEvent[] => {
  if (events.length === 0) return [];

  // Check if any events have channelType (new format)
  const hasChannelType = events.some((e) => e.channelType !== undefined);

  if (hasChannelType) {
    // New format: use explicit channelType for routing
    // Handle mixed case: events with channelType + legacy events without
    const eventsWithChannelType = events.filter((e) => e.channelType !== undefined);
    const eventsWithoutChannelType = events.filter((e) => e.channelType === undefined);

    const results: AggregatedTerminalEvent[] = [];
    results.push(...processEventsWithChannelType(eventsWithChannelType));

    // Process legacy events (if any) separately
    if (eventsWithoutChannelType.length > 0) {
      results.push(...processLegacyEvents(eventsWithoutChannelType));
    }

    // Re-sort after merging
    results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return results;
  }

  // Legacy format: use heuristic approach
  return processLegacyEvents(events);
};
