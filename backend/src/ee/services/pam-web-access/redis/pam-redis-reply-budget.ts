import { Redis } from "ioredis";

export type TReplyBudget = {
  attach: (client: Redis) => void;
  arm: () => void;
  exceeded: () => boolean;
};

export const createReplyBudget = (maxBytes: number): TReplyBudget => {
  let remaining = maxBytes;
  let exceeded = false;

  return {
    // attaching before ready would flow the socket before ioredis builds its parser, losing bytes
    attach: (client) => {
      client.once("ready", () => {
        client.stream.prependListener("data", (chunk: Buffer) => {
          if (exceeded) return;
          remaining -= chunk.length;
          if (remaining < 0) {
            exceeded = true;
            client.stream.destroy();
          }
        });
      });
    },

    arm: () => {
      remaining = maxBytes;
    },

    exceeded: () => exceeded
  };
};
