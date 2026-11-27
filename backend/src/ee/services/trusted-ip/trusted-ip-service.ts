import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { BadRequestError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TTrustedIpDALFactory } from "./trusted-ip-dal";
import { TTrustedIpServiceFactory } from "./trusted-ip-types";

type TTrustedIpServiceFactoryDep = {
  trustedIpDAL: TTrustedIpDALFactory;
  projectPermissionService: TProjectPermissionService;
  licenseService: TLicenseService;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const trustedIpServiceFactory = ({
  trustedIpDAL,
  projectPermissionService,
  licenseService,
  projectDAL
}: TTrustedIpServiceFactoryDep): TTrustedIpServiceFactory => {
  const listIpsByProjectId: TTrustedIpServiceFactory["listIpsByProjectId"] = async ({ projectId, actor }) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.IpAllowList });
    const trustedIps = await trustedIpDAL.find({
      projectId
    });
    return trustedIps;
  };

  const addProjectIp: TTrustedIpServiceFactory["addProjectIp"] = async ({
    projectId,
    actor,
    ipAddress: ip,
    comment,
    isActive
  }) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.IpAllowList });

    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.has(PlanFeature.IpAllowlisting))
      throw new BadRequestError({
        message: "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
      });

    const isValidIp = isValidIpOrCidr(ip);
    if (!isValidIp)
      throw new BadRequestError({
        message: "The IP is not a valid IPv4, IPv6, or CIDR block"
      });

    const { ipAddress, type, prefix } = extractIPDetails(ip);
    const trustedIp = await trustedIpDAL.create({
      projectId,
      ipAddress,
      type,
      prefix,
      isActive,
      comment
    });

    return { trustedIp, project }; // for audit log
  };

  const updateProjectIp: TTrustedIpServiceFactory["updateProjectIp"] = async ({
    projectId,
    actor,
    ipAddress: ip,
    comment,
    trustedIpId
  }) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.IpAllowList });

    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.has(PlanFeature.IpAllowlisting))
      throw new BadRequestError({
        message: "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
      });

    const isValidIp = isValidIpOrCidr(ip);
    if (!isValidIp)
      throw new BadRequestError({
        message: "The IP is not a valid IPv4, IPv6, or CIDR block"
      });

    const { ipAddress, type, prefix } = extractIPDetails(ip);
    const [trustedIp] = await trustedIpDAL.update(
      { projectId, id: trustedIpId },
      {
        projectId,
        ipAddress,
        type,
        prefix: prefix === undefined ? null : prefix,
        comment
      }
    );

    return { trustedIp, project }; // for audit log
  };

  const deleteProjectIp: TTrustedIpServiceFactory["deleteProjectIp"] = async ({ projectId, actor, trustedIpId }) => {
    const permission = await projectPermissionService.getProjectPermission({ actor, projectId });
    permission.assert({ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.IpAllowList });

    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.has(PlanFeature.IpAllowlisting))
      throw new BadRequestError({
        message: "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
      });

    const [trustedIp] = await trustedIpDAL.delete({ projectId, id: trustedIpId });

    return { trustedIp, project }; // for audit log
  };
  return {
    listIpsByProjectId,
    addProjectIp,
    updateProjectIp,
    deleteProjectIp
  };
};
