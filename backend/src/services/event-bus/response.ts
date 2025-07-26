/* eslint-disable no-underscore-dangle */
import { Transform } from "stream";

import { EventData } from "./types";

export class ServerSentEventsResponse extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  static getHeaders() {
    return {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*" // TODO: Testing
    };
  }

  // We ignore the encoding parameter since we are using objectMode
  _transform(chunk: EventData, _: BufferEncoding, callback: (error?: Error | null) => void): void {
    try {
      let payload = "";

      if (chunk.time) {
        payload += `id: ${chunk.time}\n`;
      }

      if (chunk.type) {
        payload += `event: ${chunk.type}\n`;
      }

      if (chunk.data) {
        payload += `data: ${JSON.stringify(chunk)}\n`;
      }

      payload += "\n";

      this.push(payload);
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }
}
