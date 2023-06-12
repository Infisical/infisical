import Stripe from "stripe";
import { Types } from "mongoose";
import { Organization, MembershipOrg } from "../models";
import {
  ACCEPTED
} from "../variables";
import {
  getStripeSecretKey,
  getStripeProductPro,
  getStripeProductTeam,
  getStripeProductStarter,
} from "../config";
import {
  EELicenseService
} from '../ee/services';
import {
  getLicenseServerUrl
} from '../config';
import {
  licenseServerKeyRequest,
  licenseKeyRequest
} from '../config/request';

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
  let organization;
  // register stripe account
  const stripe = new Stripe(await getStripeSecretKey(), {
    apiVersion: "2022-08-01",
  });

  if (await getStripeSecretKey()) {
    const customer = await stripe.customers.create({
      email,
      description: name,
    });

    organization = await new Organization({
      name,
      customerId: customer.id,
    }).save();
  } else {
    organization = await new Organization({
      name,
    }).save();
  }

  await initSubscriptionOrg({ organizationId: organization._id });

  return organization;
};

/**
 * Initialize free-tier subscription for new organization
 * @param {Object} obj
 * @param {String} obj.organizationId - id of associated organization for subscription
 * @return {Object} obj
 * @return {Object} obj.stripeSubscription - new stripe subscription
 * @return {Subscription} obj.subscription - new subscription
 */
export const initSubscriptionOrg = async ({
  organizationId,
}: {
  organizationId: Types.ObjectId;
}) => {
  let stripeSubscription;
  let subscription;

  // find organization
  const organization = await Organization.findOne({
    _id: organizationId,
  });

  if (organization) {
    if (organization.customerId) {
      // initialize starter subscription with quantity of 0
      const stripe = new Stripe(await getStripeSecretKey(), {
        apiVersion: "2022-08-01",
      });

      const productToPriceMap = {
        starter: await getStripeProductStarter(),
        team: await getStripeProductTeam(),
        pro: await getStripeProductPro(),
      };

      stripeSubscription = await stripe.subscriptions.create({
        customer: organization.customerId,
        items: [
          {
            price: productToPriceMap["starter"],
            quantity: 1,
          },
        ],
        payment_behavior: "default_incomplete",
        proration_behavior: "none",
        expand: ["latest_invoice.payment_intent"],
      });
    }
  } else {
    throw new Error("Failed to initialize free organization subscription");
  }

  return {
    stripeSubscription,
    subscription,
  };
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
  let stripeSubscription;
  // find organization
  const organization = await Organization.findOne({
    _id: organizationId,
  });

  if (organization && organization.customerId) {
    if (EELicenseService.instanceType === 'cloud') {
      // instance of Infisical is a cloud instance
      const quantity = await MembershipOrg.countDocuments({
        organization: new Types.ObjectId(organizationId),
        status: ACCEPTED,
      });
      
      await licenseServerKeyRequest.patch(
        `${await getLicenseServerUrl()}/api/license-server/v1/customers/${organization.customerId}/cloud-plan`,
        {
          quantity
        }
      );

      EELicenseService.localFeatureSet.del(organizationId);
    }
  }

  if (EELicenseService.instanceType === 'enterprise-self-hosted') {
    // instance of Infisical is an enterprise self-hosted instance
    
    const usedSeats = await MembershipOrg.countDocuments({
      status: ACCEPTED
    });

    await licenseKeyRequest.patch(
      `${await getLicenseServerUrl()}/api/license/v1/license`,
      {
        usedSeats
      }
    );
  }

  await EELicenseService.refreshOrganizationPlan(organizationId);

  return stripeSubscription;
};