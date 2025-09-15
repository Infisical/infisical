import RE2 from "re2";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { publicEndpointLimit } from "@app/server/config/rateLimiter";

const versionSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(new RE2(/^[a-zA-Z0-9._/-]+$/), "Invalid version format");
const booleanSchema = z.boolean().default(false);
const queryBooleanSchema = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === "string") {
      return val === "true" || val === "1";
    }
    return val;
  })
  .default(false);

export const registerUpgradePathRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/versions",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      querystring: z.object({
        includePrerelease: queryBooleanSchema
      }),
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
        const { includePrerelease } = req.query;
        const versions = await req.server.services.upgradePath.getGitHubReleases(includePrerelease);

        return {
          versions
        };
      } catch (error) {
        req.log.error(error, "Failed to fetch versions");
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
      body: z.object({
        fromVersion: versionSchema,
        toVersion: versionSchema,
        includePrerelease: booleanSchema
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
        const { fromVersion, toVersion, includePrerelease } = req.body;

        req.log.info({ fromVersion, toVersion, includePrerelease }, "Calculating upgrade path");

        const result = await req.server.services.upgradePath.calculateUpgradePath(
          fromVersion,
          toVersion,
          includePrerelease
        );

        req.log.info(
          { pathLength: result.path.length, hasBreaking: result.breakingChanges.length > 0 },
          "Upgrade path calculated"
        );

        return result;
      } catch (error) {
        req.log.error(error, "Failed to calculate upgrade path");
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
