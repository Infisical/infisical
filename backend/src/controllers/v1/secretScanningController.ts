import { Request, Response } from "express";
import {
  GitAppInstallationSession,
  GitAppOrganizationInstallation,
  GitRisks
} from "../../ee/models";
import crypto from "crypto";
import { Types } from "mongoose";
import { OrganizationNotFoundError, UnauthorizedRequestError } from "../../utils/errors";
import { scanGithubFullRepoForSecretLeaks } from "../../queues/secret-scanning/githubScanFullRepository";
import { getSecretScanningGitAppId, getSecretScanningPrivateKey } from "../../config";
import {
  STATUS_RESOLVED_FALSE_POSITIVE,
  STATUS_RESOLVED_NOT_REVOKED,
  STATUS_RESOLVED_REVOKED
} from "../../ee/models/gitRisks";
import { ProbotOctokit } from "probot";
import { Organization } from "../../models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/secretScanning";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  getUserOrgPermissions
} from "../../ee/services/RoleService";
import { ForbiddenError } from "@casl/ability";

export const createInstallationSession = async (req: Request, res: Response) => {
  const sessionId = crypto.randomBytes(16).toString("hex");
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.CreateInstalLSessionv1, req);

  const organization = await Organization.findById(organizationId);
  if (!organization) {
    throw OrganizationNotFoundError({
      message: "Failed to find organization"
    });
  }

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Create,
    OrgPermissionSubjects.SecretScanning
  );

  await GitAppInstallationSession.findByIdAndUpdate(
    organization,
    {
      organization: organization.id,
      sessionId: sessionId,
      user: new Types.ObjectId(req.user._id)
    },
    { upsert: true }
  ).lean();

  res.send({
    sessionId: sessionId
  });
};

export const linkInstallationToOrganization = async (req: Request, res: Response) => {
  const {
    body: { sessionId, installationId }
  } = await validateRequest(reqValidator.LinkInstallationToOrgv1, req);

  const installationSession = await GitAppInstallationSession.findOneAndDelete({
    sessionId: sessionId
  });
  if (!installationSession) {
    throw UnauthorizedRequestError();
  }

  const { permission } = await getUserOrgPermissions(
    req.user._id,
    installationSession.organization.toString()
  );
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Edit,
    OrgPermissionSubjects.SecretScanning
  );

  const installationLink = await GitAppOrganizationInstallation.findOneAndUpdate(
    {
      organizationId: installationSession.organization
    },
    {
      installationId: installationId,
      organizationId: installationSession.organization,
      user: installationSession.user
    },
    {
      upsert: true
    }
  ).lean();

  const octokit = new ProbotOctokit({
    auth: {
      appId: await getSecretScanningGitAppId(),
      privateKey: await getSecretScanningPrivateKey(),
      installationId: installationId.toString()
    }
  });

  const {
    data: { repositories }
  } = await octokit.apps.listReposAccessibleToInstallation();
  for (const repository of repositories) {
    scanGithubFullRepoForSecretLeaks({
      organizationId: installationSession.organization.toString(),
      installationId,
      repository: { id: repository.id, fullName: repository.full_name }
    });
  }
  res.json(installationLink);
};

export const getCurrentOrganizationInstallationStatus = async (req: Request, res: Response) => {
  const { organizationId } = req.params;
  try {
    const appInstallation = await GitAppOrganizationInstallation.findOne({
      organizationId: organizationId
    }).lean();
    if (!appInstallation) {
      res.json({
        appInstallationComplete: false
      });
    }

    res.json({
      appInstallationComplete: true
    });
  } catch {
    res.json({
      appInstallationComplete: false
    });
  }
};

export const getRisksForOrganization = async (req: Request, res: Response) => {
  const {
    params: { organizationId }
  } = await validateRequest(reqValidator.GetOrgRisksv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Read,
    OrgPermissionSubjects.SecretScanning
  );

  const risks = await GitRisks.find({ organization: organizationId })
    .sort({ createdAt: -1 })
    .lean();
  res.json({
    risks: risks
  });
};

export const updateRisksStatus = async (req: Request, res: Response) => {
  const {
    params: { organizationId, riskId },
    body: { status }
  } = await validateRequest(reqValidator.UpdateRiskStatusv1, req);

  const { permission } = await getUserOrgPermissions(req.user._id, organizationId);
  ForbiddenError.from(permission).throwUnlessCan(
    OrgPermissionActions.Edit,
    OrgPermissionSubjects.SecretScanning
  );

  const isRiskResolved =
    status == STATUS_RESOLVED_FALSE_POSITIVE ||
    status == STATUS_RESOLVED_REVOKED ||
    status == STATUS_RESOLVED_NOT_REVOKED
      ? true
      : false;
  const risk = await GitRisks.findByIdAndUpdate(riskId, {
    status: status,
    isResolved: isRiskResolved
  }).lean();

  res.json(risk);
};
