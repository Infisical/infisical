import { EventEmitter, on } from "node:events";

import { Redis } from "ioredis";
import { z } from "zod";

interface EventMessage {
  /**
   * Message payload
   */
  data?: string;

  /**
   * Message identifier, if set, client will send `Last-Event-ID: <id>` header on reconnect
   */
  id?: string;

  /**
   * Message type
   */
  event?: string;

  /**
   * Update client reconnect interval (how long will client wait before trying to reconnect).
   */
  retry?: number;

  /**
   * Message comment
   */
  comment?: string;
}

export enum TopicName {
  CoreServers = "infisical::core-servers"
}

const EventSchema = z.object({
  datacontenttype: z.literal("application/json").optional().default("application/json"),
  type: z.string(),
  source: z.string(),
  time: z
    .string()
    .optional()
    .default(() => new Date().toISOString()),
  data: z.object({
    specversion: z.number().optional().default(1),
    event_type: z.string(),
    payload: z.record(z.string(), z.any())
  })
});

type EventData = z.infer<typeof EventSchema>;

export type TEventService = ReturnType<typeof eventServiceFactory>;

export function eventServiceFactory(client: Redis) {
  const emitter = new EventEmitter({ captureRejections: true });
  const publisher = client.duplicate();

  const init = async () => {
    client.on("error", (e) => {
      console.error("Redis subscription error:", e);
    });

    await client.subscribe(TopicName.CoreServers, (err) => {
      if (err) {
        return console.error(err);
      }

      client.on("message", (channel, message) => {
        console.log("Got message from redis: ", message);
        const data = JSON.parse(message) as EventData;
        emitter.emit(channel, data.type, data);
      });
    });
  };

  /**
   * Subscribes to a topic and returns an async iterator for the events.
   * @param topic - The topic to subscribe to.
   * @param signal - An AbortSignal to cancel the subscription.
   * @returns An async iterator that yields events from the specified topic.
   */
  async function subscribe(topic: TopicName, signal: AbortSignal) {
    await client.subscribe(TopicName.CoreServers);

    async function* iterator() {
      for await (const [event, data] of on(emitter, topic, { signal })) {
        yield data as EventData;
      }
    }

    return iterator;
  }

  /**
   * Publishes an event to the specified topic.
   * @param topic - The topic to publish the event to.
   * @param event - The event data to publish.
   */
  async function publish<T extends z.input<typeof EventSchema>>(topic: TopicName, event: T) {
    const { data, success, error } = await EventSchema.safeParseAsync(event);

    if (!success) {
      console.error("Invalid event data:", error);
      return;
    }

    const json = JSON.stringify(data);

    await publisher.publish(topic, json, (err) => {
      if (err) {
        return console.error(`Error publishing to channel ${topic}:`, err);
      }
    });
  }

  /**
   * Serializes an event message into a string format suitable for SSE.
   * @param chunk - The event message to serialize.
   * @returns A string representation of the event message.
   */
  function serialize(chunk: EventMessage): string {
    let payload = "";
    if (chunk.id) {
      payload += `id: ${chunk.id}\n`;
    }
    if (chunk.event) {
      payload += `event: ${chunk.event}\n`;
    }
    if (chunk.data) {
      for (const line of chunk.data.split("\n")) {
        payload += `data: ${line}\n`;
      }
    }
    if (chunk.retry) {
      payload += `retry: ${chunk.retry}\n`;
    }
    if (chunk.comment) {
      payload += `:${chunk.comment}\n`;
    }
    if (!payload) {
      return "";
    }
    payload += "\n";
    return payload;
  }

  return { init, publish, subscribe, serialize };
}
