// Fastify drains every encapsulated context's onReady phase synchronously through avvio's
// ready queue. With hundreds of per-destination route contexts that synchronous fastq drain
// recurses once per context and can blow V8's call stack at boot. A no-op async onReady hook
// makes this context's ready task resolve on a microtask, letting the stack unwind between
// sibling contexts and keeping boot recursion bounded.
export const addBootYieldHook = (server: FastifyZodProvider) => {
  server.addHook("onReady", async () => {});
};

export const withBootYield =
  (plugin: (server: FastifyZodProvider) => Promise<void>) => async (server: FastifyZodProvider) => {
    addBootYieldHook(server);
    await plugin(server);
  };
