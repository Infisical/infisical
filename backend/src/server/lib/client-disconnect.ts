import { FastifyReply } from "fastify";

// Aborts when the connection closes before the response has been written. A response that completes
// normally also emits "close", so writableEnded is what separates a finished request from an abandoned one.
export const getClientDisconnectSignal = (reply: FastifyReply): AbortSignal => {
  const controller = new AbortController();
  const res = reply.raw;

  if (res.destroyed && !res.writableEnded) {
    controller.abort();
    return controller.signal;
  }

  res.once("close", () => {
    if (!res.writableEnded) {
      controller.abort();
    }
  });

  return controller.signal;
};
