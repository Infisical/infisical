import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { publicEndpointLimit } from "@app/server/config/rateLimiter";
import { versionSchema } from "@app/services/upgrade-path/upgrade-path-schemas";

export const registerUpgradePathRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/versions",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      operationId: "listUpgradeVersions",
      response: {
        200: z.object({
          versions: z.array(
            z.object({
              tagName: z.string(),
              name: z.string(),
              publishedAt: z.string(),
              prerelease: z.boolean(),
              draft: z.boolean()
            })
          )
        })
      }
    },
    handler: async (req) => {
      try {
        const versions = await req.server.services.upgradePath.getGitHubReleases();

        return {
          versions
        };
      } catch (error) {
        logger.error(error, "Failed to fetch versions");
        if (error instanceof z.ZodError) {
          throw new BadRequestError({ message: "Invalid query parameters" });
        }
        throw new BadRequestError({ message: "Failed to fetch GitHub releases" });
      }
    }
  });

  server.route({
    method: "POST",
    url: "/calculate",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      operationId: "calculateUpgradePath",
      body: z.object({
        fromVersion: versionSchema,
        toVersion: versionSchema
      }),
      response: {
        200: z.object({
          path: z.array(
            z.object({
              version: z.string(),
              name: z.string(),
              publishedAt: z.string(),
              prerelease: z.boolean()
            })
          ),
          breakingChanges: z.array(
            z.object({
              version: z.string(),
              changes: z.array(
                z.object({
                  title: z.string(),
                  description: z.string(),
                  action: z.string()
                })
              )
            })
          ),
          features: z.array(
            z.object({
              version: z.string(),
              name: z.string(),
              body: z.string(),
              publishedAt: z.string()
            })
          ),
          hasDbMigration: z.boolean(),
          config: z.record(z.unknown())
        })
      }
    },
    handler: async (req) => {
      try {
        const { fromVersion, toVersion } = req.body;

        const result = await req.server.services.upgradePath.calculateUpgradePath(fromVersion, toVersion);

        logger.info(
          { pathLength: result.path.length, hasBreaking: result.breakingChanges.length > 0 },
          "Upgrade path calculated"
        );

        return result;
      } catch (error) {
        logger.error(error, "Failed to calculate upgrade path");
        if (error instanceof z.ZodError) {
          throw new BadRequestError({ message: `Invalid input: ${error.errors.map((e) => e.message).join(", ")}` });
        }
        if (error instanceof Error) {
          throw new BadRequestError({ message: error.message });
        }
        throw new BadRequestError({ message: "Failed to calculate upgrade path" });
      }
    }
  });
};
