import z from "zod";

import { PamAccountsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import {
  ACCOUNT_TYPE_CONFIGS,
  buildPamAccountTypeMetadata,
  PamAccountAccessibilityIssue,
  PamAccountTypeMetadataSchema
} from "@app/ee/services/pam-account/pam-account-schemas";
import {
  PamAccountSettingsOverridesSchema,
  PamTemplateSettingsSchema
} from "@app/ee/services/pam-account-template/pam-account-template-schemas";
import { SESSION_HANDLERS } from "@app/ee/services/pam-web-access/pam-session-handlers";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { withRoutePrefix } from "@app/server/lib/with-route-prefix";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

type TSupportedConfigs = typeof ACCOUNT_TYPE_CONFIGS;
type TSupportedAccountType = keyof TSupportedConfigs;
type TSupportedConfigValue = TSupportedConfigs[TSupportedAccountType];

const BaseAccountFields = PamAccountsSchema.pick({
  id: true,
  name: true,
  description: true,
  folderId: true,
  templateId: true,
  gatewayId: true,
  gatewayPoolId: true,
  recordingConnectionId: true,
  settingsOverrides: true,
  createdAt: true,
  updatedAt: true
});

const SanitizedAccountListItemSchema = BaseAccountFields.extend({
  folderName: z.string().nullable().optional(),
  templateName: z.string(),
  accountType: z.string()
});

// The admin list surfaces accessibility so unusable accounts can be flagged in the UI
const AdminAccountListItemSchema = SanitizedAccountListItemSchema.extend({
  isAccessible: z.boolean().describe("Whether the account is fully provisioned to launch a session"),
  accessibilityIssues: z
    .array(z.nativeEnum(PamAccountAccessibilityIssue))
    .describe("Reasons the account cannot launch a session, if any")
});

const accountDetailVariants = Object.entries(ACCOUNT_TYPE_CONFIGS).map(([accountType, config]) =>
  SanitizedAccountListItemSchema.extend({
    accountType: z.literal(accountType as TSupportedAccountType),
    connectionDetails: config.connectionDetails,
    templatePolicies: z.record(z.unknown()).nullable().optional(),
    templateSettings: PamTemplateSettingsSchema.nullable().optional(),
    credentials: config.sanitizedCredentials,
    isAccessible: z.boolean().describe("Whether the account is fully provisioned to launch a session"),
    accessibilityIssues: z
      .array(z.nativeEnum(PamAccountAccessibilityIssue))
      .describe("Reasons the account cannot launch a session, if any")
  })
);

const SanitizedAccountDetailSchema = z.discriminatedUnion(
  "accountType",
  accountDetailVariants as [(typeof accountDetailVariants)[number], ...(typeof accountDetailVariants)[number][]]
);

const toPascalCase = (s: string) =>
  s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

const registerPerTypeEndpoints = (
  server: FastifyZodProvider,
  accountType: PamAccountType,
  config: TSupportedConfigValue
) => {
  const typeId = toPascalCase(accountType);

  server.route({
    method: "POST",
    url: "/",
    schema: {
      operationId: `create${typeId}PamAccount`,
      description: `Create a new ${accountType} PAM account`,
      tags: [ApiDocsTags.PamAccounts],
      body: z.object({
        name: slugSchema({ field: "Name" }).describe("Name for the account"),
        description: z.string().trim().max(256).optional().describe("Optional description of the account"),
        folderId: z.string().uuid().describe("The ID of the folder to place the account in"),
        templateId: z.string().uuid().describe("The ID of the account template to use"),
        connectionDetails: config.connectionDetails,
        credentials: config.credentials,
        gatewayId: z.string().uuid().optional().describe("The ID of the gateway to use"),
        gatewayPoolId: z.string().uuid().optional().describe("The ID of the gateway pool to use"),
        recordingConnectionId: z.string().uuid().optional().describe("The ID of the recording connection to use"),
        settingsOverrides: PamAccountSettingsOverridesSchema.optional().describe(
          "Account-level template settings overrides"
        )
      }),
      response: {
        200: z.object({
          account: BaseAccountFields.extend({
            accountType: z.string(),
            folderName: z.string(),
            templateName: z.string(),
            connectionDetails: z.record(z.unknown())
          }),
          corsProbeUrl: z.string().nullable().optional()
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { corsProbeUrl, ...account } = await server.services.pamAccount.create({
        accountType,
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCOUNT_CREATE,
          metadata: {
            accountId: account.id,
            accountType,
            folderId: req.body.folderId,
            templateId: req.body.templateId,
            name: req.body.name,
            description: req.body.description
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { account, corsProbeUrl };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:accountId",
    schema: {
      operationId: `update${typeId}PamAccount`,
      description: `Update a ${accountType} PAM account`,
      tags: [ApiDocsTags.PamAccounts],
      params: z.object({ accountId: z.string().uuid().describe("The ID of the account to update") }),
      body: z.object({
        name: slugSchema({ field: "Name" }).optional().describe("New name for the account"),
        description: z.string().trim().max(256).nullable().optional().describe("Optional description of the account"),
        folderId: z.string().uuid().optional().describe("The ID of the folder to move the account to"),
        templateId: z.string().uuid().optional().describe("The ID of the account template to use"),
        connectionDetails: config.connectionDetails.optional(),
        credentials: config.credentials.optional(),
        gatewayId: z.string().uuid().nullable().optional().describe("The ID of the gateway to use"),
        gatewayPoolId: z.string().uuid().nullable().optional().describe("The ID of the gateway pool to use"),
        recordingConnectionId: z
          .string()
          .uuid()
          .nullable()
          .optional()
          .describe("The ID of the recording connection to use"),
        settingsOverrides: PamAccountSettingsOverridesSchema.optional().describe(
          "Account-level template settings overrides"
        )
      }),
      response: {
        200: z.object({
          account: BaseAccountFields,
          corsProbeUrl: z.string().nullable().optional()
        })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { corsProbeUrl, ...account } = await server.services.pamAccount.update({
        accountId: req.params.accountId,
        accountType,
        ...req.body,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCOUNT_UPDATE,
          metadata: {
            accountId: account.id,
            accountType,
            name: req.body.name,
            description: req.body.description,
            folderId: req.body.folderId,
            templateId: req.body.templateId,
            gatewayId: req.body.gatewayId,
            gatewayPoolId: req.body.gatewayPoolId,
            connectionDetailsUpdated: !!req.body.connectionDetails,
            credentialsUpdated: !!req.body.credentials
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountUpdated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { account, corsProbeUrl };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:accountId",
    schema: {
      operationId: `delete${typeId}PamAccount`,
      description: `Delete a ${accountType} PAM account`,
      tags: [ApiDocsTags.PamAccounts],
      params: z.object({ accountId: z.string().uuid().describe("The ID of the account to delete") }),
      response: {
        200: z.object({ account: BaseAccountFields })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const account = await server.services.pamAccount.deleteAccount({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.internalPamProjectId,
        event: {
          type: EventType.PAM_ACCOUNT_DELETE,
          metadata: {
            accountId: account.id,
            accountType,
            accountName: account.name
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.PamAccountDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            accountType,
            orgId: req.permission.orgId
          }
        })
        .catch(() => {});

      return { account };
    }
  });
};

export const registerPamAccountRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/types",
    schema: {
      operationId: "listPamAccountTypes",
      description: "List supported PAM account types and their form field metadata",
      tags: [ApiDocsTags.PamAccounts],
      response: {
        200: z.object({
          accountTypes: z.array(PamAccountTypeMetadataSchema)
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async () => {
      return {
        // AWS IAM supports browser access (console URL redirect) but not WebSocket-based terminal,
        // so it's added separately from SESSION_HANDLERS
        accountTypes: buildPamAccountTypeMetadata(
          new Set([...Object.keys(SESSION_HANDLERS), PamAccountType.AwsIam] as PamAccountType[])
        )
      };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    schema: {
      operationId: "listPamAccounts",
      description: "List all PAM accounts in the project",
      tags: [ApiDocsTags.PamAccounts],
      querystring: z.object({
        folderId: z.string().uuid().optional().describe("Filter accounts by folder ID"),
        templateId: z.string().uuid().optional().describe("Filter accounts by template ID"),
        search: z.string().optional().describe("Filter accounts by name")
      }),
      response: {
        200: z.object({ accounts: z.array(AdminAccountListItemSchema) })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const accounts = await server.services.pamAccount.list({
        projectId: req.internalPamProjectId,
        folderId: req.query.folderId,
        templateId: req.query.templateId,
        search: req.query.search,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { accounts };
    }
  });

  server.route({
    method: "GET",
    url: "/accessible",
    schema: {
      operationId: "listAccessiblePamAccounts",
      description: "List PAM accounts accessible to the current user",
      tags: [ApiDocsTags.PamAccounts],
      querystring: z.object({
        offset: z.coerce.number().min(0).default(0).optional().describe("Number of items to skip"),
        limit: z.coerce.number().min(1).max(100).default(20).optional().describe("Maximum number of items to return"),
        search: z.string().trim().optional().describe("Filter accounts by name (case-insensitive partial match)"),
        folderId: z.string().uuid().optional().describe("Filter accounts by folder ID"),
        accountType: z.nativeEnum(PamAccountType).optional().describe("Filter accounts by platform type")
      }),
      response: {
        200: z.object({
          accounts: z.array(
            SanitizedAccountListItemSchema.pick({
              id: true,
              name: true,
              description: true,
              folderId: true,
              templateId: true,
              createdAt: true,
              updatedAt: true,
              folderName: true,
              templateName: true,
              accountType: true
            }).extend({
              canLaunch: z.boolean().describe("Whether the caller can launch a session for this account")
            })
          ),
          totalCount: z.number()
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { accounts, totalCount } = await server.services.pamAccount.listAccessible({
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search,
        folderId: req.query.folderId,
        accountType: req.query.accountType
      });
      return { accounts, totalCount };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/permissions",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamAccountPermissions",
      description:
        "Get the caller's effective resource permissions on this account, merging folder-level and direct account-level roles.",
      tags: [ApiDocsTags.PamAccounts],
      params: z.object({ accountId: z.string().uuid().describe("The ID of the account") }),
      response: {
        200: z.object({
          data: z.object({
            permissions: z.any().array(),
            memberships: z
              .object({
                id: z.string(),
                actorUserId: z.string().nullish(),
                actorIdentityId: z.string().nullish(),
                actorGroupId: z.string().nullish(),
                roles: z.object({ role: z.string(), customRoleSlug: z.string().nullish() }).array()
              })
              .array()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const data = await server.services.pamAccount.getAccountPermissions({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { data };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId",
    schema: {
      operationId: "getPamAccount",
      description: "Get a PAM account by ID",
      tags: [ApiDocsTags.PamAccounts],
      params: z.object({ accountId: z.string().uuid().describe("The ID of the account") }),
      response: {
        200: z.object({
          account: SanitizedAccountDetailSchema
        })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const account = await server.services.pamAccount.getById({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return { account } as unknown as { account: z.infer<typeof SanitizedAccountDetailSchema> };
    }
  });

  server.route({
    method: "POST",
    url: "/:accountId/ssh-ca",
    schema: {
      operationId: "getOrCreatePamSshCa",
      description: "Get or create an SSH certificate authority for a PAM account",
      tags: [ApiDocsTags.PamAccounts],
      params: z.object({ accountId: z.string().uuid().describe("The ID of the account") }),
      response: {
        200: z.object({ publicKey: z.string() })
      }
    },
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamAccount.getOrCreateSshCa({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      if (result.created) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalPamProjectId,
          event: {
            type: EventType.PAM_ACCOUNT_SSH_CA_CREATE,
            metadata: {
              accountId: req.params.accountId,
              keyAlgorithm: result.keyAlgorithm!
            }
          }
        });
      }

      return { publicKey: result.publicKey };
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/ssh-ca-public-key",
    schema: {
      operationId: "getPamSshCaPublicKey",
      description: "Get the SSH CA public key for a PAM account",
      tags: [ApiDocsTags.PamAccounts],
      params: z.object({ accountId: z.string().uuid().describe("The ID of the account") }),
      response: {
        200: z.object({ publicKey: z.string() })
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.pamAccount.getSshCaPublicKey({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:accountId/ssh-ca-setup",
    schema: {
      operationId: "getPamSshCaSetupScript",
      description: "Get the SSH CA setup script for a PAM account",
      tags: [ApiDocsTags.PamAccounts],
      params: z.object({ accountId: z.string().uuid().describe("The ID of the account") }),
      response: {
        200: z.string()
      }
    },
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      const { publicKey: caPublicKey } = await server.services.pamAccount.getSshCaPublicKey({
        accountId: req.params.accountId,
        projectId: req.internalPamProjectId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
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

  await server.register(async (accountRouter) => {
    for (const [accountType, config] of Object.entries(ACCOUNT_TYPE_CONFIGS) as [
      TSupportedAccountType,
      TSupportedConfigValue
    ][]) {
      registerPerTypeEndpoints(withRoutePrefix(accountRouter, `/${accountType}`), accountType, config);
    }
  });
};
