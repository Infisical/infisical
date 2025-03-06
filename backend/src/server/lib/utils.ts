export const extendTimeout =
  (timeoutMs: number) =>
  (request: { raw: { socket: { setTimeout: (ms: number) => void } } }, reply: unknown, done: () => void) => {
    request.raw.socket.setTimeout(timeoutMs);
    done();
  };
