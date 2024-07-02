// this plugins allows to run infisical in standalone mode
// standalone mode = infisical backend and nextjs frontend in one server
// this way users don't need to deploy two things
import path from "node:path";

import { IS_PACKAGED } from "@app/lib/config/env";

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

    const { default: conf } = (await import(
      path.join(dir, `${frontendName}/.next/required-server-files.json`),
      // @ts-expect-error type
      {
        assert: { type: "json" }
      }
    )) as { default: { config: string } };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let NextServer: any;

    if (!IS_PACKAGED) {
      /* eslint-disable */
      const { default: nextServer } = (
        await import(path.join(dir, `${frontendName}/node_modules/next/dist/server/next-server.js`))
      ).default;

      NextServer = nextServer;
    } else {
      /* eslint-disable */
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

    server.route({
      method: ["GET", "PUT", "PATCH", "POST", "DELETE"],
      url: "/*",
      schema: {
        hide: true
      },
      handler: (req, res) =>
        nextApp
          .getRequestHandler()(req.raw, res.raw)
          .then(() => {
            res.hijack();
          })
    });
    server.addHook("onClose", () => nextApp.close());
    await nextApp.prepare();
    /* eslint-enable */
  }
};
