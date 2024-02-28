import { FastifyPluginAsync, FastifyReply } from "fastify";
import fp from "fastify-plugin";
// eslint-disable-next-line @typescript-eslint/require-await
export const serversideEvents: FastifyPluginAsync = fp(async function serversideEventsPlgin(instance): Promise<void> {
  instance.decorateReply("sse", function handler(this: FastifyReply, input): void {
    // if this already set, it's not first event
    if (!this.raw.headersSent) {
      console.log("Setting headers");
      Object.entries(this.getHeaders()).forEach(([key, value]) => {
        this.raw.setHeader(key, value ?? "");
      });
      this.raw.setHeader("Cache-Control", "no-cache");
      this.raw.setHeader("Content-Type", "text/event-stream");
      this.raw.setHeader("Access-Control-Allow-Origin", "*");
      this.raw.setHeader("Connection", "keep-alive");
      this.raw.flushHeaders(); // flush the headers to establish SSE with client

      // Ngnix will close idle connections even if the connection is keep-alive. So we send a ping every 15 seconds to keep the connection truly alive.
      const interval = setInterval(() => {
        console.log("Sending ping");
        if (!this.raw.writableEnded) {
          this.raw.write("event: ping\n");
          this.raw.write("data: Heartbeat\n\n");
        }
      }, 15_000);

      this.raw.on("close", () => {
        console.log("Connection closed");
        clearInterval(interval);
        this.raw.end();
      });
    }

    if (input.error) {
      this.raw.write("event: error\n");
      this.raw.write(
        `data: ${JSON.stringify({
          error: input.errorMessage
        })}\n\n`
      );
      this.raw.end();
      return;
    }

    this.raw.write(`data: ${input.data}\n\n`); // res.write() instead of res.send()
  });
});
