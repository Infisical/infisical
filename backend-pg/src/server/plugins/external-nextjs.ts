// this plugins allows to run infisical in standalone mode
// standalone mode = infisical backend and nextjs frontend in one server
// this way users don't need to deploy two things

import path from "node:path";

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
    const nextJsBuildPath = path.join(dir, "frontend-build");

    const { default: conf } = await import(
      path.join(dir, "frontend-build/.next/required-server-files.json"),
      // @ts-expect-error type
      {
        assert: { type: "json" }
      }
    );

    const { default: NextServer } = (
      await import(path.join(dir, "frontend-build/node_modules/next/dist/server/next-server.js"))
    ).default;
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
      handler: (req, res) =>
        nextApp
          .getRequestHandler()(req.raw, res.raw)
          .then(() => {
            res.hijack();
          })
    });
    server.addHook("onClose", () => nextApp.close());
    await nextApp.prepare();
  }
};
