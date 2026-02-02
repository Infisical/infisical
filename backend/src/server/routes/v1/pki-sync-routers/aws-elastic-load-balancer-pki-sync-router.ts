import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { AwsLoadBalancerType } from "@app/services/app-connection/aws/aws-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  AWS_ELASTIC_LOAD_BALANCER_PKI_SYNC_LIST_OPTION,
  AwsElasticLoadBalancerPkiSyncSchema,
  CreateAwsElasticLoadBalancerPkiSyncSchema,
  UpdateAwsElasticLoadBalancerPkiSyncSchema
} from "@app/services/pki-sync/aws-elastic-load-balancer";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerAwsElasticLoadBalancerPkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) => {
  registerSyncPkiEndpoints({
    destination: PkiSync.AwsElasticLoadBalancer,
    server,
    responseSchema: AwsElasticLoadBalancerPkiSyncSchema,
    createSchema: CreateAwsElasticLoadBalancerPkiSyncSchema,
    updateSchema: UpdateAwsElasticLoadBalancerPkiSyncSchema,
    syncOptions: {
      canImportCertificates: AWS_ELASTIC_LOAD_BALANCER_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: AWS_ELASTIC_LOAD_BALANCER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });

  server.route({
    method: "GET",
    url: "/load-balancers",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listAwsElasticLoadBalancers" } : {}),
      description: "List AWS Elastic Load Balancers available for the specified connection and region.",
      querystring: z.object({
        connectionId: z.string().uuid(),
        region: z.nativeEnum(AWSRegion)
      }),
      response: {
        200: z.object({
          loadBalancers: z.array(
            z.object({
              loadBalancerArn: z.string(),
              loadBalancerName: z.string(),
              type: z.nativeEnum(AwsLoadBalancerType),
              scheme: z.string(),
              state: z.string(),
              vpcId: z.string().optional(),
              dnsName: z.string().optional()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, region } = req.query;

      const loadBalancers = await server.services.appConnection.aws.listLoadBalancers(
        { connectionId, region },
        req.permission
      );

      return { loadBalancers };
    }
  });

  server.route({
    method: "GET",
    url: "/listeners",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "listAwsElasticLoadBalancerListeners" } : {}),
      description: "List HTTPS/TLS listeners for the specified AWS Elastic Load Balancer.",
      querystring: z.object({
        connectionId: z.string().uuid(),
        region: z.nativeEnum(AWSRegion),
        loadBalancerArn: z.string().trim().min(1, "Load Balancer ARN required")
      }),
      response: {
        200: z.object({
          listeners: z.array(
            z.object({
              listenerArn: z.string(),
              port: z.number(),
              protocol: z.string(),
              loadBalancerArn: z.string(),
              sslPolicy: z.string().optional(),
              certificates: z
                .array(
                  z.object({
                    certificateArn: z.string(),
                    isDefault: z.boolean()
                  })
                )
                .optional()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { connectionId, region, loadBalancerArn } = req.query;

      const listeners = await server.services.appConnection.aws.listListeners(
        { connectionId, region, loadBalancerArn },
        req.permission
      );

      return { listeners };
    }
  });

  server.route({
    method: "POST",
    url: "/:pkiSyncId/certificates/:certificateId/default",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "setAwsElbCertificateAsDefault" } : {}),
      description:
        "Set a certificate as the default for all listeners in this AWS ELB PKI Sync. This will trigger a sync immediately.",
      params: z.object({
        pkiSyncId: z.string().uuid(),
        certificateId: z.string().uuid()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId, certificateId } = req.params;

      const { message, pkiSyncInfo } = await server.services.pkiSync.setCertificateAsDefault(
        { pkiSyncId, certificateId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSyncInfo.projectId,
        event: {
          type: EventType.PKI_SYNC_SET_DEFAULT_CERTIFICATE,
          metadata: {
            pkiSyncId,
            name: pkiSyncInfo.name,
            certificateId
          }
        }
      });

      return { message };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:pkiSyncId/certificates/default",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      ...(enableOperationId ? { operationId: "clearAwsElbDefaultCertificate" } : {}),
      description:
        "Clear the default certificate for this AWS ELB PKI Sync. No certificate will be set as the default on listeners. This will trigger a sync immediately.",
      params: z.object({
        pkiSyncId: z.string().uuid()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { pkiSyncId } = req.params;

      const { message, pkiSyncInfo } = await server.services.pkiSync.clearDefaultCertificate(
        { pkiSyncId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: pkiSyncInfo.projectId,
        event: {
          type: EventType.PKI_SYNC_CLEAR_DEFAULT_CERTIFICATE,
          metadata: {
            pkiSyncId,
            name: pkiSyncInfo.name
          }
        }
      });

      return { message };
    }
  });
};
