import fs from "fs";
import path from "path";
import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const cachedDocs: Record<string, string> = {
  "/organization/projects": "",
  "/integrations/secret-syncs/overview": ""
};

// Add rewrite function above to avoid no-use-before-define lint issue
function rewriteMdxLinks(mdx: string): string {
  const s3Base = "https://mintlify.s3.us-west-1.amazonaws.com/infisical";
  const docsBase = "https://infisical.com/docs";

  // Use a prefix capture to preserve preceding char while safely inserting @absolute
  const imagePathPattern = /(\(|\s|["']|^)(\/images\/[^^\s)\]"'>]+)/g;
  const docsPathPattern = /(\(|\s|["']|^)(\/(?:documentation|integrations)\/[^^\s)\]"'>]+)/g;

  let output = mdx.replace(imagePathPattern, (_m: string, prefix: string, p: string) => `${prefix}${s3Base}${p}`);
  output = output.replace(docsPathPattern, (_m: string, prefix: string, p: string) => `${prefix}${docsBase}${p}`);

  return output;
}

export const registerDocsProxyRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/proxy-docs",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      hide: true, // Hide from API docs since this is internal
      tags: ["Documentation Proxy"],
      querystring: z.object({
        url: z.string()
      }),
      response: {
        200: z.string(),
        400: z.object({
          error: z.string()
        }),
        500: z.object({
          error: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const { url } = req.query;

      if (cachedDocs[url]) {
        return cachedDocs[url];
      }

      let mdxContent = "";
      if (url === "/organization/projects") {
        mdxContent = fs.readFileSync(path.join(__dirname, "./docs/project.mdx"), "utf8");
      } else if (url === "/integrations/app-connections/aws") {
        mdxContent = fs.readFileSync(path.join(__dirname, "./docs/aws-app-connection.mdx"), "utf8");
      } else if (url === "/integrations/secret-syncs/overview") {
        mdxContent = fs.readFileSync(path.join(__dirname, "./docs/secret-syncs.mdx"), "utf8");
      }

      if (!mdxContent) return res.status(400).send({ error: "No MDX content found for the provided url" });

      const simpleHtml = String(
        await server.services.chat.convertMdxToSimpleHtml(req.permission.orgId, rewriteMdxLinks(mdxContent))
      );
      cachedDocs[url] = simpleHtml;
      return simpleHtml;
    }
  });
};
