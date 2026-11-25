import { z } from "zod";

import { ApiDocsTags, INSTANCE_DEPLOYMENT_AWS_METADATA } from "@app/lib/api-docs";
import { getInstanceAwsAccountId } from "@app/lib/aws/instance-aws-account";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerInstanceRouter = async (server: FastifyZodProvider) => {
  // Authenticated, unlike /api/status: the AWS account ID helps an outsider enumerate IAM roles in that account.
  server.route({
    method: "GET",
    url: "/deployment/aws/metadata",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "getInstanceDeploymentAwsMetadata",
      tags: [ApiDocsTags.Instance],
      description: INSTANCE_DEPLOYMENT_AWS_METADATA.description,
      response: {
        200: z.object({
          metadata: z.object({
            accountId: z.string().nullable().describe(INSTANCE_DEPLOYMENT_AWS_METADATA.accountId)
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async () => {
      const {
        INF_APP_CONNECTION_AWS_ACCESS_KEY_ID: accessKeyId,
        INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY: secretAccessKey
      } = await server.services.instanceConfigService.getOverridableEnv();

      const accountId = await getInstanceAwsAccountId(
        accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined
      );

      return { metadata: { accountId } };
    }
  });
};
