import { Types } from "mongoose";
import { IUser, IWorkspace, IntegrationAuth } from "../models";
import { IntegrationAuthNotFoundError, UnauthorizedRequestError } from "../utils/errors";
import { IntegrationService } from "../services";
import { validateUserClientForWorkspace } from "./user";
import { AuthData } from "../interfaces/middleware";
import { ActorType } from "../ee/models";
import { z } from "zod";

/**
 * Validate authenticated clients for integration authorization with id [integrationAuthId] based
 * on any known permissions.
 * @param {Object} obj
 * @param {Object} obj.authData - authenticated client details
 * @param {Types.ObjectId} obj.integrationAuthId - id of integration authorization to validate against
 * @param {Array<'admin' | 'member'>} obj.acceptedRoles - accepted workspace roles
 * @param {String[]} obj.requiredPermissions - required permissions as part of the endpoint
 */
const validateClientForIntegrationAuth = async ({
  authData,
  integrationAuthId,
  acceptedRoles,
  attachAccessToken
}: {
  authData: AuthData;
  integrationAuthId: Types.ObjectId;
  acceptedRoles: Array<"admin" | "member">;
  attachAccessToken?: boolean;
}) => {
  const integrationAuth = await IntegrationAuth.findById(integrationAuthId)
    .populate<{ workspace: IWorkspace }>("workspace")
    .select(
      "+refreshCiphertext +refreshIV +refreshTag +accessCiphertext +accessIV +accessTag +accessExpiresAt metadata"
    );
    
  if (!integrationAuth) throw IntegrationAuthNotFoundError();

  let accessToken, accessId;
  if (attachAccessToken) {
    const access = await IntegrationService.getIntegrationAuthAccess({
      integrationAuthId: integrationAuth._id
    });

    accessToken = access.accessToken;
    accessId = access.accessId;
  }

  switch (authData.actor.type) {
    case ActorType.USER:
      await validateUserClientForWorkspace({
        user: authData.authPayload as IUser,
        workspaceId: integrationAuth.workspace._id,
        acceptedRoles
      });

      return { integrationAuth, accessToken, accessId };
    case ActorType.SERVICE:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for integration authorization"
      });
    case ActorType.SERVICE_V3:
      throw UnauthorizedRequestError({
        message: "Failed service token authorization for integration authorization"
      });
  }
};

export const GetIntegrationAuthV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  })
});

export const OauthExchangeV1 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    code: z.string().trim(),
    integration: z.string().trim(),
    url: z.string().trim().url().optional(),
  })
});

export const SaveIntegrationAccessTokenV1 = z.object({
  body: z.object({
    workspaceId: z.string().trim(),
    integration: z.string().trim(),
    accessId: z.string().trim().optional(),
    accessToken: z.string().trim().optional(),
    url: z.string().url().trim().optional(),
    namespace: z.string().trim().optional(),
    refreshToken:z.string().trim().optional()
  })
});

export const GetIntegrationAuthAppsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    teamId: z.string().trim().optional(),
    workspaceSlug: z.string().trim().optional()
  })
});

export const GetIntegrationAuthTeamsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  })
});

export const GetIntegrationAuthVercelBranchesV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    appId: z.string().trim()
  })
});

export const GetIntegrationAuthChecklyGroupsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    accountId: z.string().trim()
  })
});

export const GetIntegrationAuthQoveryOrgsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  })
});

export const GetIntegrationAuthQoveryProjectsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    orgId: z.string().trim()
  })
});

export const GetIntegrationAuthQoveryEnvironmentsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    projectId: z.string().trim()
  })
});

export const GetIntegrationAuthQoveryScopesV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    environmentId: z.string().trim()
  })
});

export const GetIntegrationAuthRailwayEnvironmentsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    appId: z.string().trim()
  })
});

export const GetIntegrationAuthRailwayServicesV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    appId: z.string().trim()
  })
});

export const GetIntegrationAuthBitbucketWorkspacesV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  })
});

export const GetIntegrationAuthNorthflankSecretGroupsV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  }),
  query: z.object({
    appId: z.string().trim()
  })
});

export const DeleteIntegrationAuthV1 = z.object({
  params: z.object({
    integrationAuthId: z.string().trim()
  })
});

export const GetIntegrationAuthTeamCityBuildConfigsV1 = z.object({
  params: z.object({
    integrationAuthId:z.string().trim()
  }),
  query: z.object({
    appId:z.string().trim()
  })
})

export { validateClientForIntegrationAuth };
