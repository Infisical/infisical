import { Types } from "mongoose";
import { MembershipOrg, Organization } from "../models";
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