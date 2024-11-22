import "@fastify/request-context";

declare module "@fastify/request-context" {
  interface RequestContextData {
    requestId: string;
  }
}
