import mongoose, { Types, mongo } from "mongoose";
import { 
  Bot, 
  BotKey,
  BotOrg,
  Folder,
  IncidentContactOrg,
  Integration,
  IntegrationAuth,
  Key,
  Membership,
  MembershipOrg,
  Organization,
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
  GitAppInstallationSession,
  GitAppOrganizationInstallation,
  GitRisks,
  Log,
  Role,
  SSOConfig,
  SecretApprovalPolicy,
  SecretApprovalRequest,
  SecretSnapshot,
  SecretVersion,
  TrustedIP
} from "../ee/models";
import {
  ACCEPTED,
} from "../variables";
import {
  EELicenseService,
} from "../ee/services";
import {
  getLicenseServerKey,
  getLicenseServerUrl,
} from "../config";
import {
  licenseKeyRequest,
  licenseServerKeyRequest,
} from "../config/request";
import {
  createBotOrg
} from "./botOrg";
import { InternalServerError, ResourceNotFoundError } from "../utils/errors";

/**
 * Create an organization with name [name]
 * @param {Object} obj
 * @param {String} obj.name - name of organization to create.
 * @param {String} obj.email - POC email that will receive invoice info
 * @param {Object} organization - new organization
 */
export const createOrganization = async ({
  name,
  email,
}: {
  name: string;
  email: string;
}) => {
  
  const licenseServerKey = await getLicenseServerKey();
  let organization;
  
  if (licenseServerKey) {
    const { data: { customerId } } = await licenseServerKeyRequest.post(
      `${await getLicenseServerUrl()}/api/license-server/v1/customers`,
      {
        email,
        name
      }
    );
    
    organization = await new Organization({
      name,
      customerId
    }).save();
    
  } else {
    organization = await new Organization({
      name,
    }).save();
  }

  // initialize bot for organization
  await createBotOrg({
    name,
    organizationId: organization._id
  });

  return organization;
};

/**
 * Delete organization with id [organizationId]
 * @param {Object} obj
 * @param {Types.ObjectId} obj.organizationId - id of organization to delete
 * @returns 
 */
export const deleteOrganization = async ({
  organizationId,
  existingSession
}: {
  organizationId: Types.ObjectId;
  existingSession?: mongo.ClientSession;
}) => {

  let session;
  
  if (existingSession) {
    session = existingSession;
  } else {
    session = await mongoose.startSession(); 
    session.startTransaction();
  }

  try {
    const organization = await Organization.findByIdAndDelete(
      organizationId,
      {
        session
      }
    );
  
    if (!organization) throw ResourceNotFoundError();
    
    await MembershipOrg.deleteMany({
      organization: organization._id
    }, {
      session
    });
    
    await BotOrg.deleteMany({
      organization: organization._id
    }, {
      session
    });
    
    await SSOConfig.deleteMany({
      organization: organization._id
    }, {
      session
    });
    
    await Role.deleteMany({
      organization: organization._id
    }, {
      session
    });

    await IncidentContactOrg.deleteMany({
      organization: organization._id
    }, {
      session
    });
    
    await GitRisks.deleteMany({
      organization: organization._id
    }, {
      session
    });
    
    await GitAppInstallationSession.deleteMany({
      organization: organization._id
    }, {
      session
    });
    
    await GitAppOrganizationInstallation.deleteMany({
      organization: organization._id
    }, {
      session
    });

    const workspaceIds = await Workspace.distinct("_id", {
      organization: organization._id
    });
    
    await Workspace.deleteMany({
      organization: organization._id
    }, {
      session
    });
    
    await Membership.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await Key.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    await Bot.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    await BotKey.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await SecretBlindIndexData.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    await Secret.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    await SecretVersion.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await SecretSnapshot.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    await SecretImport.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await Folder.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await FolderVersion.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await Webhook.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await TrustedIP.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    await Tag.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await IntegrationAuth.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await Integration.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await ServiceToken.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await ServiceTokenData.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await ServiceTokenDataV3.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    await ServiceTokenDataV3Key.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await AuditLog.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await Log.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await Action.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await SecretApprovalPolicy.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });

    await SecretApprovalRequest.deleteMany({
      workspace: {
        $in: workspaceIds
      }
    }, {
      session
    });
    
    if (organization.customerId) {
      // delete from stripe here
      await licenseServerKeyRequest.delete(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${organization.customerId}`
      );
    }
    
    return organization;
  } catch (err) {
    if (!existingSession) {
      await session.abortTransaction();
    }
    throw InternalServerError({
      message: "Failed to delete organization"
    });
  } finally {
    if (!existingSession) {
      await session.commitTransaction();
      session.endSession();
    }
  }
}

/**
 * Update organization subscription quantity to reflect number of members in
 * the organization.
 * @param {Object} obj
 * @param {Number} obj.organizationId - id of subscription's organization
 */
export const updateSubscriptionOrgQuantity = async ({
  organizationId,
}: {
  organizationId: string;
}) => {
  // find organization
  const organization = await Organization.findOne({
    _id: organizationId,
  });

  if (organization && organization.customerId) {
    if (EELicenseService.instanceType === "cloud") {
      // instance of Infisical is a cloud instance
      const quantity = await MembershipOrg.countDocuments({
        organization: new Types.ObjectId(organizationId),
        status: ACCEPTED,
      });
      
      await licenseServerKeyRequest.patch(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${organization.customerId}/cloud-plan`,
        {
          quantity,
        }
      );

      EELicenseService.localFeatureSet.del(organizationId);
    }
  }

  if (EELicenseService.instanceType === "enterprise-self-hosted") {
    // instance of Infisical is an enterprise self-hosted instance
    
    const usedSeats = await MembershipOrg.countDocuments({
      status: ACCEPTED,
    });

    await licenseKeyRequest.patch(
      `${await getLicenseServerUrl()}/api/license/v1/license`,
      {
        usedSeats,
      }
    );
  }

  await EELicenseService.refreshPlan(new Types.ObjectId(organizationId));
};