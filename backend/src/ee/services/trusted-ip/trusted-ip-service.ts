import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { BadRequestError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TTrustedIpDALFactory } from "./trusted-ip-dal";
import { TTrustedIpServiceFactory } from "./trusted-ip-types";

type TTrustedIpServiceFactoryDep = {
  trustedIpDAL: TTrustedIpDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const trustedIpServiceFactory = ({
  trustedIpDAL,
  permissionService,
  licenseService,
  projectDAL
}: TTrustedIpServiceFactoryDep): TTrustedIpServiceFactory => {
  const listIpsByProjectId: TTrustedIpServiceFactory["listIpsByProjectId"] = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);
    const trustedIps = await trustedIpDAL.find({
      projectId
    });
    return trustedIps;
  };

  const addProjectIp: TTrustedIpServiceFactory["addProjectIp"] = async ({
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    ipAddress: ip,
    comment,
    isActive
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.IpAllowList);

    const project = await projectDAL.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.ipAllowlisting)
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
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    ipAddress: ip,
    comment,
    trustedIpId
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.IpAllowList);

    const project = await projectDAL.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.ipAllowlisting)
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

  const deleteProjectIp: TTrustedIpServiceFactory["deleteProjectIp"] = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    trustedIpId
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.IpAllowList);

    const project = await projectDAL.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.ipAllowlisting)
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
