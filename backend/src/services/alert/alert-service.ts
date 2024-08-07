import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";

import { TAlertDALFactory } from "./alert-dal";
import { TCreateAlertDTO, TDeleteAlertDTO, TGetAlertByIdDTO, TUpdateAlertDTO } from "./alert-types";

type TAlertServiceFactoryDep = {
  alertDAL: TAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TAlertServiceFactory = ReturnType<typeof alertServiceFactory>;

export const alertServiceFactory = ({ alertDAL, permissionService }: TAlertServiceFactoryDep) => {
  const createAlert = async ({
    projectId,
    name,
    alertBeforeDays,
    emails,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateAlertDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Alerts);

    const alert = await alertDAL.create({
      projectId,
      name,
      alertBeforeDays,
      recipientEmails: emails.join(",")
    });
    return alert;
  };

  const getAlertById = async ({ alertId, actorId, actorAuthMethod, actor, actorOrgId }: TGetAlertByIdDTO) => {
    const alert = await alertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: "Alert not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Alerts);
    return alert;
  };

  const updateAlert = async ({
    alertId,
    name,
    alertBeforeDays,
    emails,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateAlertDTO) => {
    let alert = await alertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: "Alert not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Alerts);
    alert = await alertDAL.updateById(alertId, {
      name,
      alertBeforeDays,
      recipientEmails: emails ? emails.join(",") : undefined
    });

    return alert;
  };

  const deleteAlert = async ({ alertId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteAlertDTO) => {
    let alert = await alertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: "Alert not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Alerts);
    alert = await alertDAL.deleteById(alertId);
    return alert;
  };

  return {
    createAlert,
    getAlertById,
    updateAlert,
    deleteAlert
  };
};
