import http from "node:http";
import type { AddressInfo } from "node:net";

export type TFakeWebhookMessage = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  receivedAt: number;
};

type TMessagePredicate = (message: TFakeWebhookMessage) => boolean;

export type TFakeWebhookServer = {
  url: string;
  messages: () => TFakeWebhookMessage[];
  // Resolves with the first unclaimed buffered message matching `predicate` (default: any
  // message), or waits for one to arrive. A match is claimed on return, so it is never handed to
  // a second waiter — required once a fake is shared by more than one test in a file, since
  // messages then arrive interleaved and out of any one test's control. Rejects if none arrives
  // within timeoutMs.
  waitForMessage: (predicate?: TMessagePredicate, timeoutMs?: number) => Promise<TFakeWebhookMessage>;
  reset: () => void;
  stop: () => Promise<void>;
};

const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const matchAny: TMessagePredicate = () => true;

// A real listener, not an in-memory stub: webhook delivery is a real outbound HTTP call to an
// arbitrary URL (unlike, say, the AWS fakes, which replace an SDK client we control the seam
// for), so there's no module to swap out from under it.
export const createFakeWebhookServer = async (): Promise<TFakeWebhookServer> => {
  const messages: TFakeWebhookMessage[] = [];
  const claimed = new Set<TFakeWebhookMessage>();
  const waiters: { predicate: TMessagePredicate; resolve: (message: TFakeWebhookMessage) => void }[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        // Not every caller sends JSON; keep the raw text rather than failing the request.
      }

      const message: TFakeWebhookMessage = {
        method: req.method ?? "GET",
        path: req.url ?? "/",
        headers: req.headers,
        body,
        receivedAt: Date.now()
      };
      messages.push(message);

      // First registered waiter whose predicate matches wins, so two tests waiting on the same
      // fake with distinct predicates each get their own message rather than racing for it.
      const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex !== -1) {
        const [waiter] = waiters.splice(waiterIndex, 1);
        claimed.add(message);
        waiter.resolve(message);
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  const waitForMessage = (
    predicate: TMessagePredicate = matchAny,
    timeoutMs = DEFAULT_WAIT_TIMEOUT_MS
  ): Promise<TFakeWebhookMessage> => {
    const buffered = messages.find((message) => !claimed.has(message) && predicate(message));
    if (buffered) {
      claimed.add(buffered);
      return Promise.resolve(buffered);
    }

    return new Promise<TFakeWebhookMessage>((resolve, reject) => {
      const waiter = { predicate, resolve };

      const timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index !== -1) waiters.splice(index, 1);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for a matching webhook message`));
      }, timeoutMs);

      waiter.resolve = (message) => {
        clearTimeout(timer);
        resolve(message);
      };

      waiters.push(waiter);
    });
  };

  return {
    url: `http://127.0.0.1:${port}/`,
    messages: () => messages,
    waitForMessage,
    reset: () => {
      messages.length = 0;
      claimed.clear();
    },
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      })
  };
};
