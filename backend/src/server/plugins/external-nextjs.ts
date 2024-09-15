// this plugins allows to run infisical in standalone mode
// standalone mode = infisical backend and nextjs frontend in one server
// this way users don't need to deploy two things
import fs from "node:fs";
import path from "node:path";

import staticServe from "@fastify/static";

import { IS_PACKAGED } from "@app/lib/config/env";

// Function to check if a file exists in the public directory
const doesFileExistsInPublic = async (publicDir: string, filepath: string) => {
  try {
    const stat = await fs.promises.stat(path.join(publicDir, decodeURIComponent(filepath)));
    return stat.isFile();
  } catch {
    return false;
  }
};

// to enabled this u need to set standalone mode to true
export const registerExternalNextjs = async (
  server: FastifyZodProvider,
  {
    standaloneMode,
    dir,
    port
  }: {
    standaloneMode?: boolean;
    dir: string;
    port: number;
  }
) => {
  if (standaloneMode) {
    const frontendName = IS_PACKAGED ? "frontend" : "frontend-build";
    const nextJsBuildPath = path.join(dir, frontendName);
    const STATIC_DIR = path.join(nextJsBuildPath, ".next");
    const PUBLIC_DIR = path.join(nextJsBuildPath, "public");

    const { default: conf } = (await import(
      path.join(dir, `${frontendName}/.next/required-server-files.json`),
      // @ts-expect-error type
      {
        assert: { type: "json" }
      }
    )) as { default: { config: string } };

    /* eslint-disable */
    let NextServer: any;

    if (!IS_PACKAGED) {
      const a = await import(path.join(dir, `${frontendName}/node_modules/next/dist/server/next-server.js`));
      const { default: nextServer } = a.default;

      NextServer = nextServer;
    } else {
      const nextServer = await import(path.join(dir, `${frontendName}/node_modules/next/dist/server/next-server.js`));
      NextServer = nextServer.default;
    }

    const nextApp = new NextServer({
      dev: false,
      dir: nextJsBuildPath,
      port,
      conf: conf.config,
      hostname: "local",
      customServer: false
    });
    const handleNextRequests = nextApp.getRequestHandler();
    await nextApp.prepare();

    // Serve static files from .next/static
    server.register(staticServe, {
      root: STATIC_DIR,
      prefix: `/_next/`
    });

    server.route({
      method: ["GET"],
      url: "/*",
      schema: {
        hide: true
      },
      handler: async (req, res) => {
        const isPublicFile = await doesFileExistsInPublic(PUBLIC_DIR, req.url);
        if (isPublicFile) {
          return res.sendFile(decodeURIComponent(req.url), PUBLIC_DIR);
        }

        for (const [headerName, headerValue] of Object.entries(res.getHeaders())) {
          res.raw.setHeader(headerName, headerValue as string);
        }

        return handleNextRequests(req.raw, res.raw).then(() => {
          res.hijack();
        });
      }
    });
    server.addHook("onClose", () => nextApp.close());
    /* eslint-enable */
  }
};
