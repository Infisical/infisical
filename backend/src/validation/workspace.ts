import { Types } from "mongoose";
import { IServiceTokenData, IUser, Workspace } from "../models";
import { ActorType } from "../ee/models";
import { validateUserClientForWorkspace } from "./user";
import { validateServiceTokenDataClientForWorkspace } from "./serviceTokenData";
import { WorkspaceNotFoundError } from "../utils/errors";
import { AuthData } from "../interfaces/middleware";
import { z } from "zod";
import { EventType, UserAgentType } from "../ee/models";
import { UnauthorizedRequestError } from "../utils/errors";

/**
 * Validate authenticated clients for workspace with id [workspaceId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.workspaceId - id of workspace to validate against
 * @param {String} obj.environment - (optional) environment in workspace to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
export const validateClientForWorkspace = async ({
  authData,
  workspaceId,
  environment,
  acceptedRoles,
  requiredPermissions
}: {
  authData: AuthData;
  workspaceId: Types.ObjectId;
  environment?: string;
  acceptedRoles: Array<"admin" | "member">;
  requiredPermissions?: string[];
}) => {
  const workspace = await Workspace.findById(workspaceId);

  if (!workspace)
    throw WorkspaceNotFoundError({
      message: "Failed to find workspace"
    });

  let membership;
  switch (authData.actor.type) {
    case ActorType.USER:
      membership = await validateUserClientForWorkspace({
        user: authData.authPayload as IUser,
        workspaceId,
        environment,
        acceptedRoles,
        requiredPermissions
      });

      return { membership, workspace };
    case ActorType.SERVICE:
      await validateServiceTokenDataClientForWorkspace({
        serviceTokenData: authData.authPayload as IServiceTokenData,
        workspaceId,
        environment,
        requiredPermissions
      });
      return { membership, workspace };
    case ActorType.SERVICE_V3:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for organization"
      });
  }
};

export const GetWorkspaceSecretSnapshotsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  query: z.object({
    environment: z.string().trim(),
    directory: z.string().trim().default("/"),
    offset: z.coerce.number(),
    limit: z.coerce.number()
  })
});

export const GetWorkspaceSecretSnapshotsCountV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  query: z.object({
    environment: z.string().trim(),
    directory: z.string().trim().default("/")
  })
});

export const RollbackWorkspaceSecretSnapshotV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    environment: z.string().trim(),
    directory: z.string().trim().default("/"),
    version: z.number()
  })
});

export const GetWorkspaceLogsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  query: z.object({
    offset: z.coerce.number(),
    limit: z.coerce.number(),
    sortBy: z.string().trim().optional(),
    userId: z.string().trim().optional(),
    actionNames: z.string().trim().optional()
  })
});

export const GetWorkspaceAuditLogsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  query: z.object({
    eventType: z.nativeEnum(EventType).nullable().optional(),
    userAgentType: z.nativeEnum(UserAgentType).nullable().optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
    offset: z.coerce.number().default(0),
    limit: z.coerce.number().default(20),
    actor: z.string().nullish().optional()
  })
});

export const GetWorkspaceAuditLogActorFilterOptsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceTrustedIpsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const AddWorkspaceTrustedIpV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    ipAddress: z.string().trim(),
    comment: z.string().trim().default(""),
    isActive: z.boolean()
  })
});

export const UpdateWorkspaceTrustedIpV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim(),
    trustedIpId: z.string().trim()
  }),
  body: z.object({
    ipAddress: z.string().trim(),
    comment: z.string().trim().default("")
  })
});

export const DeleteWorkspaceTrustedIpV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim(),
    trustedIpId: z.string().trim()
  })
});

export const GetWorkspacePublicKeysV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceMembershipsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const CreateWorkspaceV1 = z.object({
  body: z.object({
    workspaceName: z.string().trim(),
    organizationId: z.string().trim()
  })
});

export const DeleteWorkspaceV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const ChangeWorkspaceNameV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    name: z.string().trim()
  })
});

export const InviteUserToWorkspaceV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    email: z.string().trim()
  })
});

export const GetWorkspaceIntegrationsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceIntegrationAuthorizationsV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceServiceTokensV1 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceServiceTokenDataV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceKeyV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceMembershipsV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const UpdateWorkspaceMembershipsV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim(),
    membershipId: z.string().trim()
  }),
  body: z.object({
    role: z.string().trim()
  })
});

export const DeleteWorkspaceMembershipsV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim(),
    membershipId: z.string().trim()
  })
});

export const ToggleAutoCapitalizationV2 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    autoCapitalization: z.boolean()
  })
});

export const GetWorkspaceBlinkIndexStatusV3 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const GetWorkspaceSecretsV3 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});

export const NameWorkspaceSecretsV3 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  }),
  body: z.object({
    secretsToUpdate: z
      .object({
        secretName: z.string().trim(),
        _id: z.string().trim()
      })
      .array()
  })
});

export const GetWorkspaceServiceTokenDataV3 = z.object({
  params: z.object({
    workspaceId: z.string().trim()
  })
});
