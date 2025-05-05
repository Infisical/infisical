import { FastifyReply } from "fastify";

export const addNoCacheHeaders = (reply: FastifyReply) => {
  void reply.header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  void reply.header("Pragma", "no-cache");
  void reply.header("Expires", "0");
  void reply.header("Surrogate-Control", "no-store");
};
