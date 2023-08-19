import { Types } from "mongoose";
import { Request, Response } from "express";
import {
  IUser,
  Integration,
  IntegrationAuth,
  Membership,
  MembershipOrg,
  ServiceToken,
  Workspace,
} from "../../models";
import {
  createWorkspace as create,
  deleteWorkspace as deleteWork,
} from "../../helpers/workspace";
import { EELicenseService } from "../../ee/services";
import { addMemberships } from "../../helpers/membership";
import { ADMIN } from "../../variables";

/**
 * Return public keys of members of workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspacePublicKeys = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  const publicKeys = (
    await Membership.find({
      workspace: workspaceId,
    }).populate<{ user: IUser }>("user", "publicKey")
  ).map((member) => {
    return {
      publicKey: member.user.publicKey,
      userId: member.user._id,
    };
  });

  return res.status(200).send({
    publicKeys,
  });
};

/**
 * Return memberships for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceMemberships = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  const users = await Membership.find({
    workspace: workspaceId,
  }).populate("user", "+publicKey");

  return res.status(200).send({
    users,
  });
};

/**
 * Return workspaces that user is part of
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaces = async (req: Request, res: Response) => {
  const workspaces = (
    await Membership.find({
      user: req.user._id,
    }).populate("workspace")
  ).map((m) => m.workspace);

  return res.status(200).send({
    workspaces,
  });
};

/**
 * Return workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspace = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  const workspace = await Workspace.findOne({
    _id: workspaceId,
  });

  return res.status(200).send({
    workspace,
  });
};

/**
 * Create new workspace named [workspaceName] under organization with id
 * [organizationId] and add user as admin
 * @param req
 * @param res
 * @returns
 */
export const createWorkspace = async (req: Request, res: Response) => {
  const { workspaceName, organizationId } = req.body;

  // validate organization membership
  const membershipOrg = await MembershipOrg.findOne({
    user: req.user._id,
    organization: new Types.ObjectId(organizationId),
  });

  if (!membershipOrg) {
    throw new Error("Failed to validate organization membership");
  }

  const plan = await EELicenseService.getPlan(new Types.ObjectId(organizationId));
  
  if (plan.workspaceLimit !== null) {
    // case: limit imposed on number of workspaces allowed
    if (plan.workspacesUsed >= plan.workspaceLimit) {
      // case: number of workspaces used exceeds the number of workspaces allowed
      return res.status(400).send({
        message: "Failed to create workspace due to plan limit reached. Upgrade plan to add more workspaces.",
      });
    }
  }

  if (workspaceName.length < 1) {
    throw new Error("Workspace names must be at least 1-character long");
  }

  // create workspace and add user as member
  const workspace = await create({
    name: workspaceName,
    organizationId: new Types.ObjectId(organizationId),
  });

  await addMemberships({
    userIds: [req.user._id],
    workspaceId: workspace._id.toString(),
    roles: [ADMIN],
  });

  return res.status(200).send({
    workspace,
  });
};

/**
 * Delete workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const deleteWorkspace = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  // delete workspace
  await deleteWork({
    id: workspaceId,
  });

  return res.status(200).send({
    message: "Successfully deleted workspace",
  });
};

/**
 * Change name of workspace with id [workspaceId] to [name]
 * @param req
 * @param res
 * @returns
 */
export const changeWorkspaceName = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const { name } = req.body;

  const workspace = await Workspace.findOneAndUpdate(
    {
      _id: workspaceId,
    },
    {
      name,
    },
    {
      new: true,
    }
  );

  return res.status(200).send({
    message: "Successfully changed workspace name",
    workspace,
  });
};

/**
 * Return integrations for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceIntegrations = async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  const integrations = await Integration.find({
    workspace: workspaceId,
  });

  return res.status(200).send({
    integrations,
  });
};

/**
 * Return (integration) authorizations for workspace with id [workspaceId]
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceIntegrationAuthorizations = async (
  req: Request,
  res: Response
) => {
  const { workspaceId } = req.params;

  const authorizations = await IntegrationAuth.find({
    workspace: workspaceId,
  });

  return res.status(200).send({
    authorizations,
  });
};

/**
 * Return service service tokens for workspace [workspaceId] belonging to user
 * @param req
 * @param res
 * @returns
 */
export const getWorkspaceServiceTokens = async (
  req: Request,
  res: Response
) => {
  const { workspaceId } = req.params;
  // ?? FIX.
  const serviceTokens = await ServiceToken.find({
    user: req.user._id,
    workspace: workspaceId,
  });

  return res.status(200).send({
    serviceTokens,
  });
};
