import path from "node:path";

import staticServe from "@fastify/static";

import { IS_PACKAGED } from "@app/lib/config/env";

// to enabled this u need to set standalone mode to true
export const registerServeUI = async (
  server: FastifyZodProvider,
  {
    standaloneMode,
    dir
  }: {
    standaloneMode?: boolean;
    dir: string;
  }
) => {
  if (standaloneMode) {
    const frontendName = IS_PACKAGED ? "frontend" : "frontend-build";
    const frontendPath = path.join(dir, frontendName);
    await server.register(staticServe, {
      root: frontendPath,
      wildcard: false
    });

    server.get("/*", (request, reply) => {
      if (request.url.startsWith("/api")) {
        reply.callNotFound();
        return;
      }
      void reply.sendFile("index.html");
    });
  }
};
