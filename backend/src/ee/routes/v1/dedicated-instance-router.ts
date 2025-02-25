import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const DedicatedInstanceSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  instanceName: z.string().min(1),
  subdomain: z.string().min(1),
  status: z.enum(["RUNNING", "UPGRADING", "PROVISIONING", "FAILED"]),
  rdsInstanceType: z.string(),
  elasticCacheType: z.string(),
  elasticContainerMemory: z.number(),
  elasticContainerCpu: z.number(),
  region: z.string(),
  version: z.string(),
  backupRetentionDays: z.number(),
  lastBackupTime: z.date().nullable(),
  lastUpgradeTime: z.date().nullable(),
  publiclyAccessible: z.boolean(),
  vpcId: z.string().nullable(),
  subnetIds: z.array(z.string()).nullable(),
  tags: z.record(z.string()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

const CreateDedicatedInstanceSchema = z.object({
  instanceName: z.string().min(1),
  subdomain: z.string().min(1),
  provider: z.literal('aws'), // Only allow 'aws' as provider
  region: z.string(),
  publiclyAccessible: z.boolean().default(false)
});

const DedicatedInstanceDetailsSchema = DedicatedInstanceSchema.extend({
  stackStatus: z.string().optional(),
  stackStatusReason: z.string().optional(),
  error: z.string().nullable(),
  events: z.array(
    z.object({
      timestamp: z.date().optional(),
      logicalResourceId: z.string().optional(),
      resourceType: z.string().optional(),
      resourceStatus: z.string().optional(),
      resourceStatusReason: z.string().optional()
    })
  ).optional()
});

export const registerDedicatedInstanceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:organizationId/dedicated-instances",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().uuid()
      }),
      response: {
        200: z.object({
          instances: DedicatedInstanceSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const instances = await server.services.dedicatedInstance.listInstances({
        orgId: req.params.organizationId
      });
      return { instances };
    }
  });

  server.route({
    method: "POST",
    url: "/:organizationId/dedicated-instances",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().uuid()
      }),
      body: CreateDedicatedInstanceSchema
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { organizationId } = req.params;
      const { instanceName, subdomain, region, publiclyAccessible, provider} = req.body;

      const instance = await server.services.dedicatedInstance.createInstance({
        orgId: organizationId,
        instanceName,
        subdomain,
        region,
        publiclyAccessible,
        provider: provider,
        dryRun: false,
      });

      return instance;
    }
  });

  server.route({
    method: "GET",
    url: "/:organizationId/dedicated-instances/:instanceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string().uuid(),
        instanceId: z.string().uuid()
      }),
      response: {
        200: DedicatedInstanceDetailsSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { organizationId, instanceId } = req.params;
      const { instance, stackStatus, stackStatusReason, events } = await server.services.dedicatedInstance.getInstance({
        orgId: organizationId,
        instanceId
      });

      return {
        ...instance,
        stackStatus,
        stackStatusReason,
        events
      };
    }
  });
}; 