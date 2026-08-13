import z from "zod";

import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import {
  BlastRadiusLeg,
  BlastRadiusWindow,
  DestinationKind,
  DestinationStatus,
  ExposureBand,
  ExposureDriverTone,
  PrincipalAccessFilter,
  PrincipalOrder,
  PrincipalType,
  PrincipalUsageFilter,
  ReadPrecision,
  RotationVerdict
} from "@app/ee/services/secret-blast-radius/secret-blast-radius-types";
import { RAW_SECRETS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const AccessListEntrySchema = z.object({
  allowedActions: z.nativeEnum(ProjectPermissionSecretActions).array(),
  id: z.string(),
  name: z.string(),
  membershipId: z.string()
});

const GrantPathSchema = z.object({
  sourceId: z.string(),
  via: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("group"), groupId: z.string(), groupName: z.string() }),
      z.object({
        kind: z.literal("role"),
        roleName: z.string(),
        roleSlug: z.string().optional(),
        isTemporary: z.boolean(),
        expiresAt: z.string().optional()
      }),
      z.object({
        kind: z.literal("additionalPrivilege"),
        privilegeId: z.string(),
        name: z.string(),
        isTemporary: z.boolean(),
        expiresAt: z.string().optional()
      })
    ])
    .array(),
  conditions: z.object({ field: z.string(), operator: z.string(), value: z.unknown() }).array()
});

const ObservedActivitySchema = z.object({
  readCount: z.number(),
  lastReadAt: z.string().nullable(),
  lastReadOutsideWindow: z.boolean(),
  precision: z.nativeEnum(ReadPrecision).nullable(),
  clients: z.string().array()
});

const ConsumerSchema = z.object({
  actorId: z.string().nullable(),
  actorType: z.string(),
  label: z.string(),
  authMethod: z.string().optional(),
  clients: z.string().array(),
  readCount: z.number(),
  lastReadAt: z.string(),
  precision: z.nativeEnum(ReadPrecision),
  entitledNow: z.boolean(),
  principalExists: z.boolean()
});

const SimulationItemSchema = z.object({ code: z.string(), message: z.string() });

const BlastRadiusSchema = z.object({
  secret: z.object({
    id: z.string(),
    key: z.string(),
    environment: z.string(),
    environmentName: z.string(),
    secretPath: z.string(),
    folderId: z.string(),
    version: z.number(),
    lastValueChangedAt: z.string(),
    isRotationManaged: z.boolean(),
    hasApprovalPolicy: z.boolean()
  }),
  exposure: z.object({
    score: z.number().nullable(),
    band: z.nativeEnum(ExposureBand),
    drivers: z
      .object({
        label: z.string(),
        points: z.number(),
        tone: z.nativeEnum(ExposureDriverTone)
      })
      .array()
  }),
  principals: z
    .object({
      id: z.string(),
      name: z.string(),
      type: z.nativeEnum(PrincipalType),
      actions: z.nativeEnum(ProjectPermissionSecretActions).array(),
      memberCount: z.number().optional(),
      members: z
        .object({
          id: z.string(),
          name: z.string(),
          type: z.nativeEnum(PrincipalType)
        })
        .array()
        .optional(),
      grantPaths: GrantPathSchema.array(),
      observed: ObservedActivitySchema.nullable()
    })
    .array(),
  destinations: z
    .object({
      id: z.string(),
      kind: z.nativeEnum(DestinationKind),
      label: z.string(),
      provider: z.string().optional(),
      target: z.string().optional(),
      status: z.nativeEnum(DestinationStatus),
      statusMessage: z.string().optional(),
      lastSyncedAt: z.string().optional(),
      autoSync: z.boolean().optional(),
      crossProject: z.boolean()
    })
    .array(),
  consumers: ConsumerSchema.array(),
  ghostReaders: ConsumerSchema.array(),
  window: z.object({
    requestedDays: z.number(),
    effectiveDays: z.number(),
    boundByRetention: z.boolean(),
    consumptionAvailable: z.boolean()
  }),
  truncated: z.object({
    principals: z.object({
      drawn: z.number(),
      total: z.number(),
      notDrawnWithReads: z.number(),
      notDrawnWithoutReads: z.number()
    }),
    destinations: z.object({ drawn: z.number(), total: z.number() }),
    consumers: z.object({ drawn: z.number(), total: z.number() })
  })
});

export const registerSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:secretName/access-list",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get list of users, machine identities, and groups with access to a secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(RAW_SECRETS.GET_ACCESS_LIST.secretName)
      }),
      querystring: z.object({
        projectId: z.string().trim().describe(RAW_SECRETS.GET_ACCESS_LIST.projectId),
        environment: z.string().trim().describe(RAW_SECRETS.GET_ACCESS_LIST.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.GET_ACCESS_LIST.secretPath),
        includeAllEntities: z
          .enum(["true", "false"])
          .default("false")
          .transform((val) => val === "true")
          .describe(RAW_SECRETS.GET_ACCESS_LIST.includeAllEntities)
      }),
      response: {
        200: z.object({
          groups: AccessListEntrySchema.extend({
            userIds: z.string().array(),
            identityIds: z.string().array()
          }).array(),
          identities: AccessListEntrySchema.array(),
          users: AccessListEntrySchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secretName } = req.params;
      const { secretPath, environment, projectId, includeAllEntities } = req.query;

      return server.services.secret.getSecretAccessList({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretPath,
        environment,
        projectId,
        secretName,
        includeAllEntities
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:secretName/blast-radius",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description:
        "Get everything that touches a secret: who is entitled to read it and why, where its value has been distributed, and who has actually read it",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: SecretNameSchema.describe(RAW_SECRETS.GET_BLAST_RADIUS.secretName)
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36).describe(RAW_SECRETS.GET_BLAST_RADIUS.projectId),
        environment: z.string().trim().min(1).max(64).describe(RAW_SECRETS.GET_BLAST_RADIUS.environment),
        secretPath: z
          .string()
          .trim()
          .max(1024)
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.secretPath),
        window: z
          .nativeEnum(BlastRadiusWindow)
          .default(BlastRadiusWindow.ThirtyDays)
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.window),
        include: z
          .string()
          .trim()
          .max(128)
          .optional()
          .transform((value) => {
            if (!value) return Object.values(BlastRadiusLeg);

            const legs = value.split(",").map((leg) => leg.trim());
            return Object.values(BlastRadiusLeg).filter((leg) => legs.includes(leg));
          })
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.include),
        principalLimit: z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.principalLimit),
        principalOffset: z.coerce
          .number()
          .int()
          .min(0)
          .default(0)
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.principalOffset),
        principalOrder: z
          .nativeEnum(PrincipalOrder)
          .default(PrincipalOrder.NoReadsFirst)
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.principalOrder),
        principalAccess: z
          .nativeEnum(PrincipalAccessFilter)
          .default(PrincipalAccessFilter.All)
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.principalAccess),
        principalUsage: z
          .nativeEnum(PrincipalUsageFilter)
          .default(PrincipalUsageFilter.All)
          .describe(RAW_SECRETS.GET_BLAST_RADIUS.principalUsage)
      }),
      response: {
        200: z.object({ blastRadius: BlastRadiusSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const blastRadius = await server.services.secretBlastRadius.getSecretBlastRadius({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretName: req.params.secretName,
        ...req.query
      });

      return { blastRadius };
    }
  });

  server.route({
    method: "GET",
    url: "/:secretName/rotation-simulation",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description:
        "Simulate rotating a secret: what breaks if you rotate it now, and why it is overdue anyway. Nothing is changed.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: SecretNameSchema.describe(RAW_SECRETS.SIMULATE_ROTATION.secretName)
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36).describe(RAW_SECRETS.SIMULATE_ROTATION.projectId),
        environment: z.string().trim().min(1).max(64).describe(RAW_SECRETS.SIMULATE_ROTATION.environment),
        secretPath: z
          .string()
          .trim()
          .max(1024)
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.SIMULATE_ROTATION.secretPath),
        window: z
          .nativeEnum(BlastRadiusWindow)
          .default(BlastRadiusWindow.ThirtyDays)
          .describe(RAW_SECRETS.SIMULATE_ROTATION.window)
      }),
      response: {
        200: z.object({
          simulation: z.object({
            secret: z.object({ key: z.string(), environment: z.string(), secretPath: z.string() }),
            verdict: z.nativeEnum(RotationVerdict),
            headline: z.string(),
            subheadline: z.string(),
            reasonsToRotate: SimulationItemSchema.array(),
            impacts: SimulationItemSchema.array(),
            worthKnowing: SimulationItemSchema.array(),
            willUpdateAutomatically: SimulationItemSchema.array(),
            consumptionAvailable: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const simulation = await server.services.secretBlastRadius.simulateSecretRotation({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretName: req.params.secretName,
        ...req.query
      });

      return { simulation };
    }
  });
};
