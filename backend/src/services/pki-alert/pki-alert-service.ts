import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";

import { TPkiAlertDALFactory } from "./pki-alert-dal";
import { TCreateAlertDTO, TDeleteAlertDTO, TGetAlertByIdDTO, TUpdateAlertDTO } from "./pki-alert-types";

type TPkiAlertServiceFactoryDep = {
  pkiAlertDAL: TPkiAlertDALFactory;
  pkiCollectionDAL: TPkiCollectionDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPkiAlertServiceFactory = ReturnType<typeof pkiAlertServiceFactory>;

export const pkiAlertServiceFactory = ({
  pkiAlertDAL,
  pkiCollectionDAL,
  permissionService
}: TPkiAlertServiceFactoryDep) => {
  const createPkiAlert = async ({
    projectId,
    name,
    pkiCollectionId,
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

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts);

    const pkiCollection = await pkiCollectionDAL.findById(pkiCollectionId);
    if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });
    if (pkiCollection.projectId !== projectId)
      throw new UnauthorizedError({ message: "PKI collection not found in project" });

    const alert = await pkiAlertDAL.create({
      projectId,
      pkiCollectionId,
      name,
      alertBeforeDays,
      recipientEmails: emails.join(",")
    });
    return alert;
  };

  const getPkiAlertById = async ({ alertId, actorId, actorAuthMethod, actor, actorOrgId }: TGetAlertByIdDTO) => {
    const alert = await pkiAlertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: "Alert not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiAlerts);
    return alert;
  };

  const updatePkiAlert = async ({
    alertId,
    name,
    pkiCollectionId,
    alertBeforeDays,
    emails,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateAlertDTO) => {
    let alert = await pkiAlertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: "Alert not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts);

    if (pkiCollectionId) {
      const pkiCollection = await pkiCollectionDAL.findById(pkiCollectionId);
      if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });
      if (pkiCollection.projectId !== alert.projectId)
        throw new UnauthorizedError({ message: "PKI collection not found in project" });
    }

    alert = await pkiAlertDAL.updateById(alertId, {
      name,
      alertBeforeDays,
      ...(pkiCollectionId && { pkiCollectionId }),
      ...(emails && { recipientEmails: emails.join(",") }) // TODO: standardize recipient emails
    });

    return alert;
  };

  const deletePkiAlert = async ({ alertId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteAlertDTO) => {
    let alert = await pkiAlertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: "Alert not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts);
    alert = await pkiAlertDAL.deleteById(alertId);
    return alert;
  };

  return {
    createPkiAlert,
    getPkiAlertById,
    updatePkiAlert,
    deletePkiAlert
  };
};
