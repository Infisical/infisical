import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPamResource } from "@app/ee/services/pam-resource/pam-resource-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamResourceEndpoints = <T extends TPamResource>({
  server,
  resourceType,
  createResourceSchema,
  updateResourceSchema,
  resourceResponseSchema
}: {
  server: FastifyZodProvider;
  resourceType: PamResource;
  createResourceSchema: z.ZodType<{
    projectId: T["projectId"];
    connectionDetails: T["connectionDetails"];
    gatewayId?: T["gatewayId"];
    name: T["name"];
    rotationAccountCredentials?: T["rotationAccountCredentials"];
  }>;
  updateResourceSchema: z.ZodType<{
    connectionDetails?: T["connectionDetails"];
    gatewayId?: T["gatewayId"];
    name?: T["name"];
    rotationAccountCredentials?: T["rotationAccountCredentials"];
  }>;
  resourceResponseSchema: z.ZodTypeAny;
}) => {
  server.route({
    method: "GET",
    url: "/:resourceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.getById(req.params.resourceId, resourceType, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: resource.projectId,
        event: {
          type: EventType.PAM_RESOURCE_GET,
          metadata: {
            resourceId: resource.id,
            resourceType: resource.resourceType,
            name: resource.name
          }
        }
      });

      return { resource };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create PAM resource",
      body: createResourceSchema,
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.create(
        {
          ...req.body,
          resourceType
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: req.body.projectId,
        event: {
          type: EventType.PAM_RESOURCE_CREATE,
          metadata: {
            resourceType,
            ...(req.body.gatewayId && { gatewayId: req.body.gatewayId }),
            name: req.body.name
          }
        }
      });

      return { resource };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:resourceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Update PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      body: updateResourceSchema,
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.updateById(
        {
          ...req.body,
          resourceId: req.params.resourceId
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: resource.projectId,
        event: {
          type: EventType.PAM_RESOURCE_UPDATE,
          metadata: {
            resourceId: req.params.resourceId,
            resourceType,
            ...(req.body.gatewayId && { gatewayId: req.body.gatewayId }),
            ...(req.body.name && { name: req.body.name })
          }
        }
      });

      return { resource };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:resourceId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          resource: resourceResponseSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const resource = await server.services.pamResource.deleteById(req.params.resourceId, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: resource.projectId,
        event: {
          type: EventType.PAM_RESOURCE_DELETE,
          metadata: {
            resourceId: req.params.resourceId,
            resourceType
          }
        }
      });

      return { resource };
    }
  });
};

export const registerSshCaPublicKeyEndpoint = (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:resourceId/ssh-ca-public-key",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get the SSH CA public key for the PAM resource",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.string()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      const { caPublicKey } = await server.services.pamResource.getOrCreateSshCa(req.params.resourceId, req.permission);

      void reply.header("Content-Type", "text/plain; charset=utf-8");
      return caPublicKey;
    }
  });
};

export const registerSshCaSetupEndpoint = (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:resourceId/ssh-ca-setup",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get PAM resource SSH CA setup script for configuring the target server to trust the CA",
      params: z.object({
        resourceId: z.string().uuid()
      }),
      response: {
        200: z.string()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      const { caPublicKey } = await server.services.pamResource.getOrCreateSshCa(req.params.resourceId, req.permission);

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
};
