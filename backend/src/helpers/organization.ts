import * as Sentry from '@sentry/node';
import Stripe from 'stripe';
import { Types } from 'mongoose';
import { ACCEPTED } from '../variables';
import { Organization, MembershipOrg, Workspace, Membership } from '../models';
import {
    getStripeSecretKey,
    getStripeProductPro,
    getStripeProductTeam,
    getStripeProductStarter
} from '../config';
import { deleteWorkspace } from './workspace';

/**
 * Create an organization with name [name]
 * @param {Object} obj
 * @param {String} obj.name - name of organization to create.
 * @param {String} obj.email - POC email that will receive invoice info
 * @param {Object} organization - new organization
 */
const createOrganization = async ({
    name,
    email
}: {
    name: string;
    email: string;
}) => {
    let organization;
    try {
        // register stripe account
        const stripe = new Stripe(getStripeSecretKey(), {
            apiVersion: '2022-08-01'
        });

        if (getStripeSecretKey()) {
            const customer = await stripe.customers.create({
                email,
                description: name
            });

            organization = await new Organization({
                name,
                customerId: customer.id
            }).save();
        } else {
            organization = await new Organization({
                name
            }).save();
        }

        await initSubscriptionOrg({ organizationId: organization._id });
    } catch (err) {
        Sentry.setUser({ email });
        Sentry.captureException(err);
        throw new Error(`Failed to create organization [err=${err}]`);
    }

    return organization;
};

const deleteOrganization = async ({
    email,
    orgId
}: {
    email: string;
    orgId: string;
}) => {
    let organization;
    try {
        // delete the organization itself
        organization = await Organization.findByIdAndDelete(orgId);

        // delete all the workspaces
        // first get all the workspaces ids
        const workspaceIds = (
            await Workspace.find({
                organization: organization?.id
            })
        ).map((m) => m.id);

        // delete all the workspaces one by one
        for (let id in workspaceIds) {
            await deleteWorkspace({ id });
        }

        // delete all the membersOrg
        MembershipOrg.deleteMany({
            organization: organization?._id
        });

        // delete the stripe customer
        const stripe = new Stripe(getStripeSecretKey(), {
            apiVersion: '2022-08-01'
        });

        if (getStripeSecretKey()) {
            // delete the stripe customer
            const customer = await stripe.customers.list({
                email: email,
                limit: 1
            });
            console.log(customer.data[0].id);
            const customerId = customer.data[0].id;

            await stripe.customers.del(customerId);
        }
    } catch (err) {
        Sentry.setUser({ email });
        Sentry.captureException(err);
        throw new Error(`Failed to delete organization [err=${err}]`);
    }

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
const initSubscriptionOrg = async ({
    organizationId
}: {
    organizationId: Types.ObjectId;
}) => {
    let stripeSubscription;
    let subscription;
    try {
        // find organization
        const organization = await Organization.findOne({
            _id: organizationId
        });

        if (organization) {
            if (organization.customerId) {
                // initialize starter subscription with quantity of 0
                const stripe = new Stripe(getStripeSecretKey(), {
                    apiVersion: '2022-08-01'
                });

                // const productToPriceMap = {
                //     starter: getStripeProductStarter(),
                //     team: getStripeProductTeam(),
                //     pro: getStripeProductPro()
                // };

                // stripeSubscription = await stripe.subscriptions.create({
                //     customer: organization.customerId,
                //     items: [
                //         {
                //             price: productToPriceMap['starter'],
                //             quantity: 1
                //         }
                //     ],
                //     payment_behavior: 'default_incomplete',
                //     proration_behavior: 'none',
                //     expand: ['latest_invoice.payment_intent']
                // });
            }
        } else {
            throw new Error(
                'Failed to initialize free organization subscription'
            );
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
        throw new Error('Failed to initialize free organization subscription');
    }

    return {
        stripeSubscription,
        subscription
    };
};

/**
 * Update organization subscription quantity to reflect number of members in
 * the organization.
 * @param {Object} obj
 * @param {Number} obj.organizationId - id of subscription's organization
 */
const updateSubscriptionOrgQuantity = async ({
    organizationId
}: {
    organizationId: string;
}) => {
    let stripeSubscription;
    try {
        // find organization
        const organization = await Organization.findOne({
            _id: organizationId
        });

        if (organization && organization.customerId) {
            const quantity = await MembershipOrg.countDocuments({
                organization: organizationId,
                status: ACCEPTED
            });

            const stripe = new Stripe(getStripeSecretKey(), {
                apiVersion: '2022-08-01'
            });

            const subscription = (
                await stripe.subscriptions.list({
                    customer: organization.customerId
                })
            ).data[0];

            stripeSubscription = await stripe.subscriptions.update(
                subscription.id,
                {
                    items: [
                        {
                            id: subscription.items.data[0].id,
                            price: subscription.items.data[0].price.id,
                            quantity
                        }
                    ]
                }
            );
        }
    } catch (err) {
        Sentry.setUser(null);
        Sentry.captureException(err);
    }

    return stripeSubscription;
};

export {
    createOrganization,
    deleteOrganization,
    initSubscriptionOrg,
    updateSubscriptionOrgQuantity
};
