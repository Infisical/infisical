import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

import { PamResource } from "../pam-resource/pam-resource-enums";
import { TPamSessionCommandLog, TTerminalEvent } from "./pam-session-types";

const MAX_LOG_CHARS = 200_000; // rough guard before sending to LLM

export const formatLogsForSummary = (
  logs: (TPamSessionCommandLog | TTerminalEvent)[],
  resourceType: PamResource
): string => {
  if (resourceType === PamResource.Postgres) {
    const sqlLogs = logs as TPamSessionCommandLog[];
    const lines = sqlLogs.map((log, i) => {
      const ts = new Date(log.timestamp).toISOString();
      return `[${i + 1}] [${ts}]\nQuery: ${log.input.trim()}\nResult: ${log.output.trim()}`;
    });
    const joined = lines.join("\n\n");
    return joined.length > MAX_LOG_CHARS ? joined.slice(0, MAX_LOG_CHARS) + "\n...(truncated)" : joined;
  }

  // SSH: extract input events and decode Base64 → printable text
  const terminalLogs = logs as TTerminalEvent[];
  const inputLines: string[] = [];
  for (const event of terminalLogs) {
    if (event.eventType !== "input") continue;
    try {
      const decoded = Buffer.from(event.data, "base64").toString("utf8");
      // Keep only printable ASCII and common whitespace, strip ANSI escape codes
      // eslint-disable-next-line no-control-regex
      const cleaned = decoded.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[^\x20-\x7e\t\n\r]/g, "");
      if (cleaned.trim()) inputLines.push(cleaned);
    } catch {
      // skip malformed base64
    }
  }
  const combined = inputLines.join("");
  return combined.length > MAX_LOG_CHARS ? combined.slice(0, MAX_LOG_CHARS) + "\n...(truncated)" : combined;
};

export const buildSummaryPrompt = ({
  resourceType,
  resourceName,
  actorName,
  actorEmail,
  durationSeconds,
  formattedLogs
}: {
  resourceType: PamResource;
  resourceName: string;
  actorName: string;
  actorEmail: string;
  durationSeconds: number;
  formattedLogs: string;
}): { system: string; user: string } => {
  const system =
    resourceType === PamResource.Postgres
      ? `You are a security analyst reviewing a privileged access session on a PostgreSQL database.
The session was initiated through a data explorer tool that automatically runs queries to enumerate tables and inspect schema metadata on startup — these auto-generated queries are normal and expected. Do not flag them.

Write a concise summary of what the user actually did. Focus on meaningful actions: DML writes (INSERT/UPDATE/DELETE), DDL changes (CREATE/DROP/ALTER), stored procedure or function modifications, and privilege changes (GRANT/REVOKE).

Only add a warning for actions that are clearly destructive or suspicious — for example: bulk or unconditional DELETE/UPDATE, DROP TABLE/DATABASE, TRUNCATE, privilege escalation, or writes to sensitive system tables. Do NOT warn about SELECT queries, schema inspection, pg_catalog or information_schema reads, or any other read-only operations regardless of their scope.

Populate "summary" with a high-level overview (2-4 sentences) of the user's intent and the overall nature of their activity — not a chronological list of events. Write it as if explaining to a security team what the user was trying to accomplish, grouping related actions together. Populate "warnings" with short bullet strings (each ≤ 20 words) for clearly destructive or suspicious write/modification actions only; leave it empty if none.`
      : `You are a security analyst reviewing a privileged access session on an SSH server.
Only add a warning for actions that are clearly destructive or suspicious — for example: deleting files or directories (rm -rf), killing processes (kill/pkill), privilege escalation (sudo su, passwd), exfiltrating data (curl/wget to external hosts, nc), modifying system files (chmod/chown on sensitive paths), or installing/removing software. Do NOT warn about routine read-only commands (ls, cat, grep, ps, top, df, etc.) or typical developer/admin operations unless they target clearly sensitive paths.

Populate "summary" with a high-level overview (2-4 sentences) of the user's intent and the overall nature of their activity — not a chronological list of events. Write it as if explaining to a security team what the user was trying to accomplish, grouping related actions together. Populate "warnings" with short bullet strings (each ≤ 20 words) for clearly destructive or suspicious actions only; leave it empty if none.`;

  const user = `Session metadata:
- Resource: ${resourceName} (${resourceType})
- Actor: ${actorName} <${actorEmail}>
- Duration: ${Math.round(durationSeconds)}s

Session logs:
${formattedLogs}`;

  return { system, user };
};

const SessionSummarySchema = z.object({
  summary: z.string(),
  warnings: z.array(z.string())
});

export const generateSessionSummary = async (
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<{ summary: string; warnings: string[] }> => {
  const anthropic = createAnthropic({ apiKey });

  const { object } = await generateObject({
    model: anthropic(model),
    schema: SessionSummarySchema,
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 1024
  });

  return object;
};
