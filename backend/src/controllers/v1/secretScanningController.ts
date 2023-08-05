import { Request, Response } from "express";
import GitAppInstallationSession from "../../ee/models/gitAppInstallationSession";
import crypto from "crypto";
import { Types } from "mongoose";
import { UnauthorizedRequestError } from "../../utils/errors";
import GitAppOrganizationInstallation from "../../ee/models/gitAppOrganizationInstallation";
import { MembershipOrg } from "../../models";
import GitRisks, { STATUS_RESOLVED_FALSE_POSITIVE, STATUS_RESOLVED_NOT_REVOKED, STATUS_RESOLVED_REVOKED } from "../../ee/models/gitRisks";

export const createInstallationSession = async (req: Request, res: Response) => {
  const sessionId = crypto.randomBytes(16).toString("hex");
  await GitAppInstallationSession.findByIdAndUpdate(
    req.organization,
    {
      organization: new Types.ObjectId(req.organization),
      sessionId: sessionId,
      user: new Types.ObjectId(req.user._id)
    },
    { upsert: true }
  ).lean();

  res.send({
    sessionId: sessionId
  })
}

export const linkInstallationToOrganization = async (req: Request, res: Response) => {
  const { installationId, sessionId } = req.body

  const installationSession = await GitAppInstallationSession.findOneAndDelete({ sessionId: sessionId })
  if (!installationSession) {
    throw UnauthorizedRequestError()
  }

  const userMembership = await MembershipOrg.find({ user: req.user._id, organization: installationSession.organization })
  if (!userMembership) {
    throw UnauthorizedRequestError()
  }

  const installationLink = await GitAppOrganizationInstallation.findOneAndUpdate({
    organizationId: installationSession.organization,
  }, {
    installationId: installationId,
    organizationId: installationSession.organization,
    user: installationSession.user
  }, {
    upsert: true
  }).lean()

  res.json(installationLink)
}

export const getCurrentOrganizationInstallationStatus = async (req: Request, res: Response) => {
  const { organizationId } = req.params
  try {
    const appInstallation = await GitAppOrganizationInstallation.findOne({ organizationId: organizationId }).lean()
    if (!appInstallation) {
      res.json({
        appInstallationComplete: false
      })
    }

    res.json({
      appInstallationComplete: true
    })
  } catch {
    res.json({
      appInstallationComplete: false
    })
  }
}

export const getRisksForOrganization = async (req: Request, res: Response) => {
  const { organizationId } = req.params
  const risks = await GitRisks.find({ organization: organizationId }).sort({ createdAt: -1 }).lean()
  res.json({
    risks: risks
  })
}

export const updateRisksStatus = async (req: Request, res: Response) => {
  const { riskId } = req.params
  const { status } = req.body
  const isRiskResolved = status == STATUS_RESOLVED_FALSE_POSITIVE || status == STATUS_RESOLVED_REVOKED || status == STATUS_RESOLVED_NOT_REVOKED ? true : false
  const risk = await GitRisks.findByIdAndUpdate(riskId, {
    status: status,
    isResolved: isRiskResolved
  }).lean()

  res.json(risk)
}