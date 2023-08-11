import { Request, Response } from "express";
import {
	IncidentContactOrg,
	Membership,
	MembershipOrg,
	Organization,
	Workspace,
} from "../../models";
import { createOrganization as create } from "../../helpers/organization";
import { addMembershipsOrg } from "../../helpers/membershipOrg";
import { ACCEPTED, OWNER } from "../../variables";
import { getLicenseServerUrl, getSiteURL } from "../../config";
import { licenseServerKeyRequest } from "../../config/request";

export const getOrganizations = async (req: Request, res: Response) => {
  const organizations = (
    await MembershipOrg.find({
      user: req.user._id,
      status: ACCEPTED,
    }).populate("organization")
  ).map((m) => m.organization);

	return res.status(200).send({
		organizations,
	});
};

/**
 * Create new organization named [organizationName]
 * and add user as owner
 * @param req
 * @param res
 * @returns
 */
export const createOrganization = async (req: Request, res: Response) => {
  const { organizationName } = req.body;

  if (organizationName.length < 1) {
    throw new Error("Organization names must be at least 1-character long");
  }

  // create organization and add user as member
  const organization = await create({
    email: req.user.email,
    name: organizationName,
  });

  await addMembershipsOrg({
    userIds: [req.user._id.toString()],
    organizationId: organization._id.toString(),
    roles: [OWNER],
    statuses: [ACCEPTED],
  });

	return res.status(200).send({
		organization,
	});
};

/**
 * Return organization with id [organizationId]
 * @param req
 * @param res
 * @returns
 */
export const getOrganization = async (req: Request, res: Response) => {
	const organization = req.organization
	return res.status(200).send({
		organization,
	});
};

/**
 * Return organization memberships for organization with id [organizationId]
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationMembers = async (req: Request, res: Response) => {
  const { organizationId } = req.params;

  const users = await MembershipOrg.find({
    organization: organizationId,
  }).populate("user", "+publicKey");

	return res.status(200).send({
		users,
	});
};

/**
 * Return workspaces that user is part of in organization with id [organizationId]
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationWorkspaces = async (
	req: Request,
	res: Response
) => {
  const { organizationId } = req.params;

  const workspacesSet = new Set(
    (
      await Workspace.find(
        {
          organization: organizationId,
        },
        "_id"
      )
    ).map((w) => w._id.toString())
  );

  const workspaces = (
    await Membership.find({
      user: req.user._id,
    }).populate("workspace")
  )
    .filter((m) => workspacesSet.has(m.workspace._id.toString()))
    .map((m) => m.workspace);

	return res.status(200).send({
		workspaces,
	});
};

/**
 * Change name of organization with id [organizationId] to [name]
 * @param req
 * @param res
 * @returns
 */
export const changeOrganizationName = async (req: Request, res: Response) => {
  const { organizationId } = req.params;
  const { name } = req.body;

  const organization = await Organization.findOneAndUpdate(
    {
      _id: organizationId,
    },
    {
      name,
    },
    {
      new: true,
    }
  );

	return res.status(200).send({
		message: "Successfully changed organization name",
		organization,
	});
};

/**
 * Return incident contacts of organization with id [organizationId]
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationIncidentContacts = async (
	req: Request,
	res: Response
) => {
  const { organizationId } = req.params;

  const incidentContactsOrg = await IncidentContactOrg.find({
    organization: organizationId,
  });

	return res.status(200).send({
		incidentContactsOrg,
	});
};

/**
 * Add and return new incident contact with email [email] for organization with id [organizationId]
 * @param req
 * @param res
 * @returns
 */
export const addOrganizationIncidentContact = async (
	req: Request,
	res: Response
) => {
  const { organizationId } = req.params;
  const { email } = req.body;

  const incidentContactOrg = await IncidentContactOrg.findOneAndUpdate(
    { email, organization: organizationId },
    { email, organization: organizationId },
    { upsert: true, new: true }
  );

	return res.status(200).send({
		incidentContactOrg,
	});
};

/**
 * Delete incident contact with email [email] for organization with id [organizationId]
 * @param req
 * @param res
 * @returns
 */
export const deleteOrganizationIncidentContact = async (
	req: Request,
	res: Response
) => {
  const { organizationId } = req.params;
  const { email } = req.body;

  const incidentContactOrg = await IncidentContactOrg.findOneAndDelete({
    email,
    organization: organizationId,
  });

	return res.status(200).send({
		message: "Successfully deleted organization incident contact",
		incidentContactOrg,
	});
};

/**
 * Redirect user to billing portal or add card page depending on
 * if there is a card on file
 * @param req
 * @param res
 * @returns
 */
export const createOrganizationPortalSession = async (
	req: Request,
	res: Response
) => {
  const { data: { pmtMethods } } = await licenseServerKeyRequest.get(
    `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/payment-methods`,
  );
  
  if (pmtMethods.length < 1) {
    // case: organization has no payment method on file
    // -> redirect to add payment method portal 
    const { data: { url } } = await licenseServerKeyRequest.post(
      `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/payment-methods`,
      {
        success_url: (await getSiteURL()) + "/dashboard",
        cancel_url: (await getSiteURL()) + "/dashboard"
      }
    );
    return res.status(200).send({ url });
  } else {
    // case: organization has payment method on file
    // -> redirect to billing portal
    const { data: { url } } = await licenseServerKeyRequest.post(
      `${await getLicenseServerUrl()}/api/license-server/v1/customers/${req.organization.customerId}/billing-details/billing-portal`,
      {
        return_url: (await getSiteURL()) + "/dashboard"
      }
    );
    return res.status(200).send({ url });
  }
};

/**
 * Given a org id, return the projects each member of the org belongs to
 * @param req
 * @param res
 * @returns
 */
export const getOrganizationMembersAndTheirWorkspaces = async (
	req: Request,
	res: Response
) => {
	const { organizationId } = req.params;

	const workspacesSet = (
			await Workspace.find(
				{
					organization: organizationId,
				},
				"_id"
			)
		).map((w) => w._id.toString());

	const memberships = (
		await Membership.find({
			workspace: { $in: workspacesSet },
		}).populate("workspace")
	);
	const userToWorkspaceIds: any = {};

	memberships.forEach(membership => {
		const user = membership.user.toString();
		if (userToWorkspaceIds[user]) {
			userToWorkspaceIds[user].push(membership.workspace);
		} else {
			userToWorkspaceIds[user] = [membership.workspace];
		}
	});

	return res.json(userToWorkspaceIds);
};
