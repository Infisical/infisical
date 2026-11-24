import { v5 as uuidv5 } from "uuid";

import { TPamSessions } from "@app/db/schemas";
import { sanitizeLogPayload } from "@app/lib/validator/log-safe-text";
import { ActorType } from "@app/services/auth/auth-type";

import {
  PamSessionActivityEventType,
  PamSessionActivitySkipReason,
  TPamSessionActivityEvent,
  TPamSessionActivityMetadata
} from "./pam-session-activity-types";

// Deterministic, so re-exporting a chunk produces ids the outbox already holds.
const PAM_SESSION_ACTIVITY_ID_NAMESPACE = "587472a7-81a3-436d-8bf2-0017552f67a4";

// Bounds the event loop time one chunk can take.
const MAX_EVENTS_PER_CHUNK = 50_000;
// Small enough that a full outbox claim of these rows is delivered well inside the stale-claim window.
const MAX_INPUT_CHARS = 16 * 1024;
const MAX_OUTPUT_CHARS = 16 * 1024;
const TRUNCATED_SUFFIX = " [truncated]";

// Strings the gateway writes into recordings.
const EXEC_PROMPT_PREFIX = "$ ";
const BLOCKED_NOTICE = "[BLOCKED] Command not permitted";
const EXEC_BLOCKED_SUFFIX = `\n${BLOCKED_NOTICE}`;
const BLOCKED_STATEMENT_PREFIX = "BLOCKED: ";

export type TPamSessionActivitySession = Pick<
  TPamSessions,
  | "id"
  | "projectId"
  | "accountId"
  | "accountName"
  | "accountType"
  | "folderName"
  | "selectedHost"
  | "userId"
  | "identityId"
  | "actorName"
  | "actorEmail"
  | "actorIp"
  | "actorUserAgent"
>;

type TRecordedEvent = Record<string, unknown>;

const isRecordedEvent = (value: unknown): value is TRecordedEvent =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const truncate = (value: string, maxChars: number) =>
  value.length > maxChars ? `${value.slice(0, maxChars)}${TRUNCATED_SUFFIX}` : value;

// The gateway JSON-encodes byte fields (terminal data, HTTP bodies) as base64.
const decodeBytes = (value: unknown) =>
  typeof value === "string" ? Buffer.from(value, "base64").toString("utf8") : "";

const optionalString = (value: unknown) => (typeof value === "string" && value ? value : undefined);

const toIsoTimestamp = (value: unknown) => {
  const date = typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();
};

// Identities have no email, which marks a deleted identity whose id was nulled.
const resolveActor = (
  session: TPamSessionActivitySession
): Pick<TPamSessionActivityEvent, "actor" | "actorMetadata"> =>
  session.identityId || (!session.userId && !session.actorEmail)
    ? { actor: ActorType.IDENTITY, actorMetadata: { identityId: session.identityId ?? null, name: session.actorName } }
    : {
        actor: ActorType.USER,
        actorMetadata: {
          userId: session.userId ?? null,
          email: session.actorEmail || null,
          username: session.actorEmail || session.actorName
        }
      };

const buildEventBase = (session: TPamSessionActivitySession, orgId: string) => ({
  orgId,
  projectId: session.projectId,
  ...resolveActor(session),
  ipAddress: session.actorIp || null,
  userAgent: session.actorUserAgent || null
});

const buildSessionMetadata = (session: TPamSessionActivitySession): TPamSessionActivityMetadata => ({
  sessionId: session.id,
  accountId: session.accountId ?? null,
  accountName: session.accountName,
  accountType: session.accountType,
  folderName: session.folderName ?? null,
  host: session.selectedHost ?? null
});

// Other input is stdin, forwarded traffic or unechoed typing such as passwords, so it is never streamed.
const toTerminalCommand = (event: TRecordedEvent, channel?: string) => {
  if (event.eventType === "output") {
    const command = optionalString(event.command);
    return command ? { command, blocked: false } : null;
  }

  const text = decodeBytes(event.data);
  if (channel === "sftp") return text ? { command: text, blocked: false } : null;
  if (channel !== "exec" || !text.startsWith(EXEC_PROMPT_PREFIX)) return null;

  const command = text.slice(EXEC_PROMPT_PREFIX.length);
  // A command's own text can end with the notice, so only the gateway's flag marks it blocked.
  return event.blocked === true && command.endsWith(EXEC_BLOCKED_SUFFIX)
    ? { command: command.slice(0, -EXEC_BLOCKED_SUFFIX.length), blocked: true }
    : { command, blocked: false };
};

const toEventId = (sessionId: string, chunkIndex: number, position: number | string) =>
  uuidv5(`${sessionId}|${chunkIndex}|${position}`, PAM_SESSION_ACTIVITY_ID_NAMESPACE);

// Lets a SIEM see the gap instead of silently missing events.
export const buildPamSessionActivitySkippedEvent = ({
  session,
  orgId,
  chunkIndex,
  reason,
  skippedEvents
}: {
  session: TPamSessionActivitySession;
  orgId: string;
  chunkIndex: number;
  reason: PamSessionActivitySkipReason;
  skippedEvents?: number;
}): TPamSessionActivityEvent =>
  sanitizeLogPayload({
    id: toEventId(session.id, chunkIndex, `skipped-${reason}`),
    ...buildEventBase(session, orgId),
    createdAt: new Date().toISOString(),
    eventType: PamSessionActivityEventType.Skipped,
    eventMetadata: { ...buildSessionMetadata(session), chunkIndex, reason, skippedEvents }
  });

export const buildPamSessionActivityEvents = ({
  session,
  orgId,
  chunkIndex,
  events
}: {
  session: TPamSessionActivitySession;
  orgId: string;
  chunkIndex: number;
  events: unknown[];
}): TPamSessionActivityEvent[] => {
  const base = buildEventBase(session, orgId);
  const sessionMetadata = buildSessionMetadata(session);

  const activity: Omit<TPamSessionActivityEvent, "id">[] = [];

  // A terminal renders one output event per line, so consecutive lines are sent as one event.
  let output: { createdAt: string; channel?: string; lines: string[]; chars: number } | null = null;

  const flushOutput = () => {
    if (!output) return;
    activity.push({
      ...base,
      createdAt: output.createdAt,
      eventType: PamSessionActivityEventType.Output,
      eventMetadata: {
        ...sessionMetadata,
        channel: output.channel,
        output: truncate(output.lines.join("\n"), MAX_OUTPUT_CHARS)
      }
    });
    output = null;
  };

  const push = (
    createdAt: string,
    eventType: PamSessionActivityEventType,
    metadata: Partial<TPamSessionActivityMetadata>
  ) => {
    flushOutput();
    activity.push({ ...base, createdAt, eventType, eventMetadata: { ...sessionMetadata, ...metadata } });
  };

  for (const event of events.slice(0, MAX_EVENTS_PER_CHUNK)) {
    if (isRecordedEvent(event)) {
      const createdAt = toIsoTimestamp(event.timestamp);

      if (typeof event.input === "string" && event.eventType === undefined) {
        const result = optionalString(event.output);
        push(createdAt, PamSessionActivityEventType.Query, {
          query: truncate(event.input, MAX_INPUT_CHARS),
          ...(result?.startsWith(BLOCKED_STATEMENT_PREFIX) ? { blocked: true } : {}),
          ...(result ? { output: truncate(result, MAX_OUTPUT_CHARS) } : {})
        });
      } else if (event.eventType === "request" || event.eventType === "response") {
        const body = decodeBytes(event.body);
        const url = optionalString(event.url);
        const isRequest = event.eventType === "request";
        push(createdAt, isRequest ? PamSessionActivityEventType.Request : PamSessionActivityEventType.Response, {
          requestId: optionalString(event.requestId),
          ...(isRequest
            ? { method: optionalString(event.method), url: url && truncate(url, MAX_INPUT_CHARS) }
            : { status: optionalString(event.status) }),
          ...(body ? { body: truncate(body, MAX_OUTPUT_CHARS) } : {})
        });
      } else if ((event.eventType === "input" || event.eventType === "output") && event.channelType !== "rdp") {
        const channel = optionalString(event.channelType);
        const command = toTerminalCommand(event, channel);

        if (command) {
          push(createdAt, PamSessionActivityEventType.Command, {
            channel,
            command: truncate(command.command, MAX_INPUT_CHARS),
            ...(command.blocked ? { blocked: true } : {})
          });
        } else if (event.eventType === "output") {
          const line = decodeBytes(event.data);
          const previous = activity[activity.length - 1];

          // On an exec channel the notice is about a line of input, which isn't streamed.
          if (
            event.blocked === true &&
            channel !== "exec" &&
            !output &&
            previous?.eventType === PamSessionActivityEventType.Command
          ) {
            previous.eventMetadata.blocked = true;
          } else {
            if (output && (output.channel !== channel || output.chars + line.length > MAX_OUTPUT_CHARS)) flushOutput();
            if (!output) output = { createdAt, channel, lines: [], chars: 0 };
            output.lines.push(line);
            output.chars += line.length + 1;
          }
        }
      }
    }
  }
  flushOutput();

  const built = activity.map((event, index) =>
    sanitizeLogPayload({ id: toEventId(session.id, chunkIndex, index), ...event })
  );

  if (events.length > MAX_EVENTS_PER_CHUNK) {
    built.push(
      buildPamSessionActivitySkippedEvent({
        session,
        orgId,
        chunkIndex,
        reason: PamSessionActivitySkipReason.TooManyEvents,
        skippedEvents: events.length - MAX_EVENTS_PER_CHUNK
      })
    );
  }

  return built;
};

const OUTPUT_ONLY_EVENT_TYPES = new Set([PamSessionActivityEventType.Output, PamSessionActivityEventType.Response]);

export const toPamSessionActivityStreamEvent = (
  event: TPamSessionActivityEvent,
  includeOutput: boolean
): TPamSessionActivityEvent | null => {
  if (includeOutput) return event;
  if (OUTPUT_ONLY_EVENT_TYPES.has(event.eventType)) return null;
  if (event.eventMetadata.output === undefined && event.eventMetadata.body === undefined) return event;

  const eventMetadata = { ...event.eventMetadata };
  delete eventMetadata.output;
  delete eventMetadata.body;
  return { ...event, eventMetadata };
};
