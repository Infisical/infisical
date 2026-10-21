# Logging

Paths are relative to `backend/`. Read [`backend/AGENTS.md`](../../../AGENTS.md) and [`backend/CODE_QUALITY.md`](../../../CODE_QUALITY.md) first.

## Logging

Uses Pino via `@app/lib/logger`. Always include key identifiers in the message string using `[key=value]` format for log searchability. You may also pass a structured object as the first argument for programmatic access, but the message must be self-contained:

```ts
// Preferred: identifiers in message + structured object
logger.error({ sessionId, err }, `Failed to get connection details [sessionId=${sessionId}]`);

// Also acceptable: identifiers in message only
logger.info(`getPlan: Process done for [orgId=${orgId}] [projectId=${projectId}]`);

// NOT preferred: identifiers only in structured object, not in message
logger.error({ sessionId, err }, "Failed to get connection details");
```

**Never log an outbound URL verbatim — a URL is often itself a credential.** Incoming-webhook providers put the bearer secret in the path (`https://hooks.slack.com/services/T…/B…/<secret>`, Discord, Teams, Telegram) and many APIs accept a token as a query param, so a raw URL in a log line ships a working credential to the log sink. Pass it through `sanitizeUrlForLog` from `@app/lib/logger` first (`src/lib/logger/sanitize-url.ts`): it keeps only the origin, strips userinfo and the fragment, redacts the entire path, and redacts every query value. Token formats can't be recognised reliably, so the path is redacted by default for every host rather than sniffed with heuristics. The global axios response interceptor (`src/lib/config/request.ts`) and `safeRequest`'s dispatch log already do this.

Note that `logger.ts` also has a `redactedKeys` list applied to structured-object fields up to depth three. It only matches by key name, so it does **not** help with a secret embedded in a `url` field.
