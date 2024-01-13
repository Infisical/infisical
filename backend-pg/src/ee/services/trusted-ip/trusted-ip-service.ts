import { ForbiddenError } from "@casl/ability";

import { BadRequestError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { TProjectPermission } from "@app/lib/types";
import { TProjectDalFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TTrustedIpDalFactory } from "./trusted-ip-dal";
import { TCreateIpDTO, TDeleteIpDTO, TUpdateIpDTO } from "./trusted-ip-types";

type TTrustedIpServiceFactoryDep = {
  trustedIpDal: TTrustedIpDalFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectDal: Pick<TProjectDalFactory, "findById">;
};

export type TTrustedIpServiceFactory = ReturnType<typeof trustedIpServiceFactory>;

export const trustedIpServiceFactory = ({
  trustedIpDal,
  permissionService,
  licenseService,
  projectDal
}: TTrustedIpServiceFactoryDep) => {
  const listIpsByProjectId = async ({ projectId, actor, actorId }: TProjectPermission) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.IpAllowList
    );
    const trustedIps = await trustedIpDal.find({
      projectId
    });
    return trustedIps;
  };

  const addProjectIp = async ({
    projectId,
    actorId,
    actor,
    ipAddress: ip,
    comment,
    isActive
  }: TCreateIpDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.IpAllowList
    );

    const project = await projectDal.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.ipAllowlisting)
      throw new BadRequestError({
        message:
          "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
      });

    const isValidIp = isValidIpOrCidr(ip);
    if (!isValidIp)
      throw new BadRequestError({
        message: "The IP is not a valid IPv4, IPv6, or CIDR block"
      });

    const { ipAddress, type, prefix } = extractIPDetails(ip);
    const trustedIp = await trustedIpDal.create({
      projectId,
      ipAddress,
      type,
      prefix,
      isActive,
      comment
    });

    return { trustedIp, project }; // for audit log
  };

  const updateProjectIp = async ({
    projectId,
    actorId,
    actor,
    ipAddress: ip,
    comment,
    trustedIpId
  }: TUpdateIpDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.IpAllowList
    );

    const project = await projectDal.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.ipAllowlisting)
      throw new BadRequestError({
        message:
          "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
      });

    const isValidIp = isValidIpOrCidr(ip);
    if (!isValidIp)
      throw new BadRequestError({
        message: "The IP is not a valid IPv4, IPv6, or CIDR block"
      });

    const { ipAddress, type, prefix } = extractIPDetails(ip);
    const [trustedIp] = await trustedIpDal.update(
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

  const deleteProjectIp = async ({ projectId, actorId, actor, trustedIpId }: TDeleteIpDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.IpAllowList
    );

    const project = await projectDal.findById(projectId);
    const plan = await licenseService.getPlan(project.orgId);
    if (!plan.ipAllowlisting)
      throw new BadRequestError({
        message:
          "Failed to add IP access range due to plan restriction. Upgrade plan to add IP access range."
      });

    const [trustedIp] = await trustedIpDal.delete({ projectId, id: trustedIpId });

    return { trustedIp, project }; // for audit log
  };
  return {
    listIpsByProjectId,
    addProjectIp,
    updateProjectIp,
    deleteProjectIp
  };
};
