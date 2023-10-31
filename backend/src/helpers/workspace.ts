import { Types, mongo } from "mongoose";
import {
  Bot,
  BotKey,
  Folder,
  Integration,
  IntegrationAuth,
  Key,
  Membership,
  Secret,
  SecretBlindIndexData,
  SecretImport,
  ServiceToken,
  ServiceTokenData,
  ServiceTokenDataV3,
  ServiceTokenDataV3Key,
  Tag,
  Webhook,
  Workspace
} from "../models";
import {
  Action,
  AuditLog,
  FolderVersion,
  IPType,
  Log,
  SecretApprovalPolicy,
  SecretApprovalRequest,
  SecretSnapshot,
  SecretVersion,
  TrustedIP
} from "../ee/models";
import { createBot } from "../helpers/bot";
import { EELicenseService } from "../ee/services";
import { SecretService } from "../services";
import { InternalServerError, ResourceNotFoundError } from "../utils/errors";
import { runMongooseTransaction } from "../utils/mongoose/run-mongoose-transaction";

/**
 * Create a workspace with name [name] in organization with id [organizationId]
 * and a bot for it.
 * @param {String} name - name of workspace to create.
 * @param {String} organizationId - id of organization to create workspace in
 * @param {Object} workspace - new workspace
 */
export const createWorkspace = async ({
  name,
  organizationId
}: {
  name: string;
  organizationId: Types.ObjectId;
}) => {
  // create workspace
  const workspace = await new Workspace({
    name,
    organization: organizationId,
    autoCapitalization: true
  }).save();

  // initialize bot for workspace
  await createBot({
    name: "Infisical Bot",
    workspaceId: workspace._id
  });

  // initialize blind index salt for workspace
  await SecretService.createSecretBlindIndexData({
    workspaceId: workspace._id
  });

  // initialize default trusted IPv4 CIDR - 0.0.0.0/0
  await new TrustedIP({
    workspace: workspace._id,
    ipAddress: "0.0.0.0",
    type: IPType.IPV4,
    prefix: 0,
    isActive: true,
    comment: ""
  }).save();

  // initialize default trusted IPv6 CIDR - ::/0
  await new TrustedIP({
    workspace: workspace._id,
    ipAddress: "::",
    type: IPType.IPV6,
    prefix: 0,
    isActive: true,
    comment: ""
  });

  await EELicenseService.refreshPlan(organizationId);

  return workspace;
};

/**
 * Delete workspace and all associated materials including memberships,
 * secrets, keys, etc.
 * @param {Object} obj
 * @param {String} obj.id - id of workspace to delete
 */
export const deleteWorkspace = async ({
  workspaceId,
  existingSession
}: {
  workspaceId: Types.ObjectId;
  existingSession?: mongo.ClientSession;
}) => {
  try {
    const workspace = await runMongooseTransaction({
      existingSession,
      transactions: async (session) => {
        const workspace = await Workspace.findByIdAndDelete(workspaceId, { session });

        if (!workspace) throw ResourceNotFoundError();

        await Promise.all([
          Membership.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Key.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Bot.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          BotKey.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          SecretBlindIndexData.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Secret.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          SecretVersion.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          SecretSnapshot.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          SecretImport.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Folder.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          FolderVersion.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Webhook.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          TrustedIP.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Tag.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          IntegrationAuth.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Integration.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          ServiceToken.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          ServiceTokenData.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          ServiceTokenDataV3.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          ServiceTokenDataV3Key.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          AuditLog.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Log.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          Action.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          SecretApprovalPolicy.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          ),
          SecretApprovalRequest.deleteMany(
            {
              workspace: workspace._id
            },
            {
              session
            }
          )
        ]);

        return workspace;
      }
    });

    return workspace;
  } catch (err) {
    throw InternalServerError({
      message: "Failed to delete organization"
    });
  }
};
