import crypto from "node:crypto";

import RE2 from "re2";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

/**
 * Inbound half of the Slack integration.
 *
 * Outbound (agent → Slack) already works: the sandbox's Slack integration brokers `slack.com`,
 * so the agent calls chat.postMessage with a placeholder token and the broker swaps in the real
 * one. Nothing here is involved in that direction.
 *
 * Inbound (Slack → agent) cannot work the same way. Two reasons the sandbox does not hold the
 * Slack connection itself:
 *
 *   1. Socket Mode is a WebSocket, and the broker strips `Upgrade` as a hop-by-hop header, so a
 *      socket opened from inside the sandbox would never be brokered.
 *   2. A sandbox is ephemeral. Messages arrive whether or not one is running, so something
 *      longer-lived has to receive them.
 *
 * So the API owns the Slack app and relays messages into the sandbox. This mirrors the "relay
 * mode" pattern OpenClaw uses for the same problem.
 */

/** Slack rejects anything older than five minutes; so do we, to bound replay. */
const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5;

/** Signals that the mention was seen, before the agent has had time to answer. */
export const SLACK_ACK_REACTION = "eyes";
export const SLACK_DONE_REACTION = "white_check_mark";

/** Relative to the sandbox root, which is a temp directory rather than a fixed path. */
export const SANDBOX_SLACK_INBOX_PATH = "$HOME/.slack/inbox.jsonl";

export type TSlackEventEnvelope = {
  type: string;
  challenge?: string;
  /** Stable per delivery. Slack fans one user message out to every subscribed event type. */
  event_id?: string;
  event?: {
    type: string;
    channel?: string;
    user?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
    subtype?: string;
  };
};

export type TSandboxSlackMessage = {
  channelId: string;
  threadTs: string | null;
  userId: string;
  text: string;
  ts: string;
};

/**
 * Verify Slack's request signature.
 *
 * Slack signs the raw body, so the caller must pass the bytes exactly as received. Re-serializing
 * parsed JSON changes them and the MAC will not match.
 */
export const verifySlackSignature = ({
  signingSecret,
  rawBody,
  timestamp,
  signature
}: {
  signingSecret: string;
  rawBody: string;
  timestamp: string;
  signature: string;
}) => {
  if (!timestamp || !signature) {
    throw new UnauthorizedError({ message: "Slack request is missing its signature headers." });
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_TIMESTAMP_SKEW_SECONDS) {
    throw new UnauthorizedError({ message: "Slack request timestamp is outside the allowed window." });
  }

  const expected = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timingSafeEqual throws on a length mismatch, which is itself a signal, so check length first.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new UnauthorizedError({ message: "Slack request signature did not match." });
  }
};

/**
 * Decide whether an envelope is a message we should relay.
 *
 * Returns null for anything we deliberately ignore: Slack's own retries of bot output, edits,
 * joins, and every non-message event type. Returning null is not an error.
 */
export const parseSlackMessage = (envelope: TSlackEventEnvelope): TSandboxSlackMessage | null => {
  const { event } = envelope;
  if (!event) return null;

  // app_mention is the gated path (someone @-ed the bot). message covers thread replies where the
  // bot is already participating, which Slack does not re-decorate as a mention.
  if (event.type !== "app_mention" && event.type !== "message") return null;

  // Never relay our own output, or we loop.
  if (event.bot_id) return null;
  // Edits, deletions, joins, and channel_topic all arrive as `message` with a subtype.
  if (event.subtype) return null;

  if (!event.channel || !event.ts || !event.user) return null;

  return {
    channelId: event.channel,
    threadTs: event.thread_ts ?? null,
    userId: event.user,
    text: (event.text ?? "").trim(),
    ts: event.ts
  };
};

/** Strip the leading `<@U123>` so the agent gets the instruction, not the mention syntax. */
const BOT_MENTION_RE = new RE2(/^\s*<@[A-Z0-9]+>\s*/i);

export const stripBotMention = (text: string) => text.replace(BOT_MENTION_RE, "").trim();

/**
 * Shell-safe command that appends one message to the sandbox's inbox.
 *
 * The sandbox has no inbound network path, so delivery rides the same exec channel everything
 * else uses. The payload is base64'd rather than interpolated: message text is attacker-controlled
 * and would otherwise be a shell injection straight into the sandbox.
 */
export const buildInboxDeliveryCommand = (message: TSandboxSlackMessage) => {
  const line = JSON.stringify({
    channel: message.channelId,
    thread_ts: message.threadTs,
    user: message.userId,
    text: stripBotMention(message.text),
    ts: message.ts,
    received_at: new Date().toISOString()
  });

  const encoded = Buffer.from(line, "utf8").toString("base64");
  const dir = SANDBOX_SLACK_INBOX_PATH.slice(0, SANDBOX_SLACK_INBOX_PATH.lastIndexOf("/"));

  return `mkdir -p ${dir} && printf '%s' '${encoded}' | base64 -d >> ${SANDBOX_SLACK_INBOX_PATH} && printf '\\n' >> ${SANDBOX_SLACK_INBOX_PATH}`;
};

export const logSlackRelay = (sandboxId: string, message: TSandboxSlackMessage) =>
  logger.info(
    { sandboxId, channelId: message.channelId, threadTs: message.threadTs },
    `Relayed Slack message into sandbox [sandboxId=${sandboxId}] [channelId=${message.channelId}]`
  );

export const assertSlackConfigured = (signingSecret?: string): string => {
  if (!signingSecret) {
    throw new BadRequestError({
      message: "Slack is not configured for sandboxes. Set the Slack signing secret before enabling two-way Slack."
    });
  }
  return signingSecret;
};

/**
 * A single Slack message arrives more than once: a mention in a channel fires both `app_mention`
 * and `message.channels`, and Slack retries anything it does not get a fast 2xx for. Keying this on
 * `event_id` does not work, because those two deliveries are different events with different ids.
 * The message itself is the only stable identity, so channel + ts is the key.
 */
const seenMessages = new Map<string, number>();
const EVENT_DEDUPE_TTL_MS = 10 * 60 * 1000;

export const isDuplicateSlackMessage = (message: TSandboxSlackMessage): boolean => {
  const key = `${message.channelId}:${message.ts}`;
  const now = Date.now();

  for (const [id, seenAt] of seenMessages) {
    if (now - seenAt > EVENT_DEDUPE_TTL_MS) seenMessages.delete(id);
  }

  if (seenMessages.has(key)) return true;
  seenMessages.set(key, now);
  return false;
};

/**
 * Posts a message as the bot from inside the sandbox. The API holds no Slack token: the integration
 * brokers it on the wire, so the request has to originate from the sandbox to pick it up.
 */
export const buildPostMessageCommand = ({
  channelId,
  threadTs,
  text
}: {
  channelId: string;
  threadTs: string | null;
  text: string;
}) => {
  const body: Record<string, string> = { channel: channelId, text };
  if (threadTs) body.thread_ts = threadTs;

  const form = Object.entries(body)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  // Base64 so the reply text cannot terminate the quoting and run as shell.
  const encoded = Buffer.from(form, "utf8").toString("base64");
  return (
    `printf '%s' '${encoded}' | base64 -d | ` +
    `curl -s -X POST -H 'Content-Type: application/x-www-form-urlencoded; charset=utf-8' ` +
    `--data-binary @- https://api.slack.com/api/chat.postMessage`
  );
};

/** Same call shape, for the instant acknowledgement. Silently a no-op without `reactions:write`. */
export const buildAddReactionCommand = ({
  channelId,
  messageTs,
  name
}: {
  channelId: string;
  messageTs: string;
  name: string;
}) =>
  `curl -s -X POST -H 'Content-Type: application/x-www-form-urlencoded' ` +
  `--data-binary '${`channel=${encodeURIComponent(channelId)}&timestamp=${encodeURIComponent(messageTs)}&name=${name}`}' ` +
  `https://api.slack.com/api/reactions.add`;
