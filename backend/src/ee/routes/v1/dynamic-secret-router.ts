import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { DynamicSecretProviderSchema } from "@app/ee/services/dynamic-secret/providers/models";
import { ApiDocsTags, DYNAMIC_SECRETS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { isValidHandleBarTemplate } from "@app/lib/template/validate-handlebars";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedDynamicSecretSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataNonEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const validateUsernameTemplateCharacters = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Underscore,
  CharacterType.Hyphen,
  CharacterType.OpenBrace,
  CharacterType.CloseBrace,
  CharacterType.CloseBracket,
  CharacterType.OpenBracket,
  CharacterType.Fullstop,
  CharacterType.SingleQuote,
  CharacterType.Spaces,
  CharacterType.Pipe,
  CharacterType.OpenParen,
  CharacterType.CloseParen,
  CharacterType.DoubleQuote
]);

const userTemplateSchema = z
  .string()
  .trim()
  .max(255)
  .refine((el) => validateUsernameTemplateCharacters(el))
  .refine((el) =>
    isValidHandleBarTemplate(el, {
      allowedExpressions: (val) =>
        ["randomUsername", "unixTimestamp", "identity.name", "dynamicSecret.name", "dynamicSecret.type"].includes(val)
    })
  );

export const registerDynamicSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.CREATE.projectSlug),
        provider: DynamicSecretProviderSchema.describe(DYNAMIC_SECRETS.CREATE.provider),
        defaultTTL: z
          .string()
          .describe(DYNAMIC_SECRETS.CREATE.defaultTTL)
          .superRefine((val, ctx) => {
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          }),
        maxTTL: z
          .string()
          .describe(DYNAMIC_SECRETS.CREATE.maxTTL)
          .optional()
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          })
          .nullable(),
        path: z.string().describe(DYNAMIC_SECRETS.CREATE.path).trim().default("/").transform(removeTrailingSlash),
        environmentSlug: z.string().describe(DYNAMIC_SECRETS.CREATE.environmentSlug).min(1),
        name: slugSchema({ min: 1, max: 64, field: "Name" }).describe(DYNAMIC_SECRETS.CREATE.name),
        metadata: ResourceMetadataNonEncryptionSchema.optional(),
        usernameTemplate: userTemplateSchema.optional()
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.DynamicSecretCreated,
          organizationId: req.permission.orgId,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            provider: dynamicSecretCfg.type,
            projectId: dynamicSecretCfg.projectId,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            defaultTTL: `${ms(dynamicSecretCfg.defaultTTL) / 1000}s`,
            maxTTL: dynamicSecretCfg.maxTTL ? `${ms(dynamicSecretCfg.maxTTL) / 1000}s` : null,
            hasGateway: Boolean(dynamicSecretCfg.gatewayId || dynamicSecretCfg.gatewayV2Id)
          }
        })
        .catch(() => {});

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dynamicSecretCfg.projectId,
        event: {
          type: EventType.CREATE_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecretCfg.name,
            dynamicSecretType: dynamicSecretCfg.type,
            dynamicSecretId: dynamicSecretCfg.id,
            defaultTTL: dynamicSecretCfg.defaultTTL,
            maxTTL: dynamicSecretCfg.maxTTL,
            gatewayV2Id: dynamicSecretCfg.gatewayV2Id,
            usernameTemplate: dynamicSecretCfg.usernameTemplate,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            projectId: dynamicSecretCfg.projectId
          }
        }
      });

      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().toLowerCase().describe(DYNAMIC_SECRETS.UPDATE.name)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.UPDATE.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.UPDATE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.UPDATE.environmentSlug),
        data: z.object({
          inputs: z.any().optional().describe(DYNAMIC_SECRETS.UPDATE.inputs),
          defaultTTL: z
            .string()
            .describe(DYNAMIC_SECRETS.UPDATE.defaultTTL)
            .optional()
            .superRefine((val, ctx) => {
              if (!val) return;
              const valMs = ms(val);
              if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
              if (valMs > ms("10y"))
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
            }),
          maxTTL: z
            .string()
            .describe(DYNAMIC_SECRETS.UPDATE.maxTTL)
            .optional()
            .superRefine((val, ctx) => {
              if (!val) return;
              const valMs = ms(val);
              if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
              if (valMs > ms("10y"))
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
            })
            .nullable(),
          newName: z.string().describe(DYNAMIC_SECRETS.UPDATE.newName).optional(),
          metadata: ResourceMetadataNonEncryptionSchema.optional(),
          usernameTemplate: userTemplateSchema.nullable().optional()
        })
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dynamicSecret, updatedFields, projectId, environment, secretPath } =
        await server.services.dynamicSecret.updateByName({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          path: req.body.path,
          projectSlug: req.body.projectSlug,
          environmentSlug: req.body.environmentSlug,
          ...req.body.data
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretType: dynamicSecret.type,
            dynamicSecretId: dynamicSecret.id,
            environment,
            secretPath,
            projectId,
            updatedFields
          }
        }
      });
      return { dynamicSecret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().toLowerCase().describe(DYNAMIC_SECRETS.DELETE.name)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.DELETE.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.DELETE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.DELETE.environmentSlug),
        isForced: z.boolean().default(false).describe(DYNAMIC_SECRETS.DELETE.isForced)
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.deleteByName({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        ...req.body
      });

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.DynamicSecretDeleted,
          organizationId: req.permission.orgId,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            provider: dynamicSecretCfg.type,
            projectId: dynamicSecretCfg.projectId,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            isForced: req.body.isForced
          }
        })
        .catch(() => {});

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dynamicSecretCfg.projectId,
        event: {
          type: EventType.DELETE_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecretCfg.name,
            dynamicSecretType: dynamicSecretCfg.type,
            dynamicSecretId: dynamicSecretCfg.id,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            projectId: dynamicSecretCfg.projectId
          }
        }
      });

      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/:name",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.name)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.GET_BY_NAME.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.environmentSlug)
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.getDetails({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dynamicSecretCfg.projectId,
        event: {
          type: EventType.GET_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecretCfg.name,
            dynamicSecretType: dynamicSecretCfg.type,
            dynamicSecretId: dynamicSecretCfg.id,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            projectId: dynamicSecretCfg.projectId
          }
        }
      });

      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.LIST.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST.environmentSlug)
      }),
      response: {
        200: z.object({
          dynamicSecrets: SanitizedDynamicSecretSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dynamicSecrets, environment, secretPath, projectId } =
        await server.services.dynamicSecret.listDynamicSecretsByEnv({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.LIST_DYNAMIC_SECRETS,
          metadata: {
            environment,
            secretPath,
            projectId
          }
        }
      });

      return { dynamicSecrets };
    }
  });

  server.route({
    url: "/:name/leases",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.name)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.projectSlug),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.environmentSlug)
      }),
      response: {
        200: z.object({
          leases: DynamicSecretLeasesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { leases, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretLease.listLeases({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.LIST_DYNAMIC_SECRET_LEASES,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretType: dynamicSecret.type,
            dynamicSecretId: dynamicSecret.id,
            environment,
            secretPath,
            projectId,
            leaseCount: leases.length
          }
        }
      });

      return { leases };
    }
  });

  server.route({
    method: "GET",
    url: "/ssh-ca-setup/:dynamicSecretId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSshDynamicSecretCaSetup",
      description: "Get SSH dynamic secret CA setup script for configuring the target server to trust the CA",
      params: z.object({
        dynamicSecretId: z.string().uuid()
      }),
      response: {
        200: z.string()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req, reply) => {
      const { caPublicKey } = await server.services.dynamicSecret.getSshCaPublicKey({
        dynamicSecretId: req.params.dynamicSecretId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      const setupScript = `#!/bin/bash
set -e

CA_PUBLIC_KEY="${caPublicKey}"
CA_FILE="/etc/ssh/infisical_ca.pub"
SSHD_CONFIG="/etc/ssh/sshd_config"

echo "==> Infisical SSH CA Setup"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

echo "==> Writing CA public key to \${CA_FILE}..."
echo "\${CA_PUBLIC_KEY}" > "\${CA_FILE}"
chmod 644 "\${CA_FILE}"
echo "    Done."

if grep -q "^TrustedUserCAKeys" "\${SSHD_CONFIG}"; then
    EXISTING_CA_FILE=$(grep "^TrustedUserCAKeys" "\${SSHD_CONFIG}" | awk '{print $2}')
    if [ "\${EXISTING_CA_FILE}" = "\${CA_FILE}" ]; then
        echo "==> TrustedUserCAKeys already configured for \${CA_FILE}"
    else
        echo "Warning: TrustedUserCAKeys is already set to \${EXISTING_CA_FILE}"
        echo "         You may need to manually update sshd_config to use \${CA_FILE}"
        echo "         or combine multiple CA keys into a single file."
    fi
else
    echo "==> Adding TrustedUserCAKeys to \${SSHD_CONFIG}..."
    echo "" >> "\${SSHD_CONFIG}"
    echo "# Infisical SSH CA - Added by setup script" >> "\${SSHD_CONFIG}"
    echo "TrustedUserCAKeys \${CA_FILE}" >> "\${SSHD_CONFIG}"
    echo "    Done."
fi

echo "==> Validating SSH configuration..."
if sshd -t; then
    echo "    Configuration is valid."
else
    echo "Error: SSH configuration is invalid. Please check \${SSHD_CONFIG}"
    exit 1
fi

echo "==> Restarting SSH service..."
if command -v systemctl &> /dev/null; then
    if systemctl cat sshd.service &>/dev/null; then
        systemctl restart sshd
    elif systemctl cat ssh.service &>/dev/null; then
        systemctl restart ssh
    else
        echo "Warning: Could not find SSH service. Please restart it manually."
    fi
elif command -v service &> /dev/null; then
    service sshd restart 2>/dev/null || service ssh restart
else
    echo "Warning: Could not detect init system. Please restart sshd manually."
fi
echo "    Done."

echo ""
echo "==> Setup complete!"
echo ""
echo "Your SSH server is now configured to trust certificates signed by the Infisical CA."
echo ""
`;

      void reply.header("Content-Type", "text/plain; charset=utf-8");
      return setupScript;
    }
  });

  server.route({
    method: "GET",
    url: "/ssh-ca-public-key/:dynamicSecretId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      operationId: "getSshDynamicSecretCaPublicKey",
      description: "Get the SSH CA public key for a dynamic secret",
      params: z.object({
        dynamicSecretId: z.string().uuid()
      }),
      response: {
        200: z.object({
          caPublicKey: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { caPublicKey } = await server.services.dynamicSecret.getSshCaPublicKey({
        dynamicSecretId: req.params.dynamicSecretId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { caPublicKey };
    }
  });

  server.route({
    method: "POST",
    url: "/entra-id/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        tenantId: z.string().min(1).describe("The tenant ID of the Azure Entra ID"),
        applicationId: z.string().min(1).describe("The application ID of the Azure Entra ID App Registration"),
        clientSecret: z.string().min(1).describe("The client secret of the Azure Entra ID App Registration")
      }),
      response: {
        200: z
          .object({
            name: z.string().min(1).describe("The name of the user"),
            id: z.string().min(1).describe("The ID of the user"),
            email: z.string().min(1).describe("The email of the user")
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.dynamicSecret.fetchAzureEntraIdUsers({
        tenantId: req.body.tenantId,
        applicationId: req.body.applicationId,
        clientSecret: req.body.clientSecret
      });
      return data;
    }
  });
};
