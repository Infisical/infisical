import { ForbiddenError } from "@casl/ability";

import { ProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { pkiItemTypeToNameMap } from "@app/services/pki-collection/pki-collection-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TProjectDALFactory } from "../project/project-dal";
import { TPkiAlertDALFactory } from "./pki-alert-dal";
import { TCreateAlertDTO, TDeleteAlertDTO, TGetAlertByIdDTO, TUpdateAlertDTO } from "./pki-alert-types";

type TPkiAlertServiceFactoryDep = {
  pkiAlertDAL: Pick<
    TPkiAlertDALFactory,
    "create" | "findById" | "updateById" | "deleteById" | "getExpiringPkiCollectionItemsForAlerting"
  >;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  smtpService: Pick<TSmtpService, "sendMail">;
  projectDAL: Pick<TProjectDALFactory, "getProjectFromSplitId">;
};

export type TPkiAlertServiceFactory = ReturnType<typeof pkiAlertServiceFactory>;

export const pkiAlertServiceFactory = ({
  pkiAlertDAL,
  pkiCollectionDAL,
  permissionService,
  smtpService,
  projectDAL
}: TPkiAlertServiceFactoryDep) => {
  const sendPkiItemExpiryNotices = async () => {
    const allAlertItems = await pkiAlertDAL.getExpiringPkiCollectionItemsForAlerting();

    const flattenedResults = allAlertItems.flatMap(({ recipientEmails, ...item }) =>
      recipientEmails.split(",").map((email) => ({
        ...item,
        recipientEmail: email.trim()
      }))
    );

    const groupedByEmail = groupBy(flattenedResults, (item) => item.recipientEmail);

    for await (const [email, items] of Object.entries(groupedByEmail)) {
      const groupedByAlert = groupBy(items, (item) => item.alertId);
      for await (const [, alertItems] of Object.entries(groupedByAlert)) {
        await smtpService.sendMail({
          recipients: [email],
          subjectLine: `Infisical CA/Certificate expiration notice: ${alertItems[0].alertName}`,
          substitutions: {
            alertName: alertItems[0].alertName,
            alertBeforeDays: items[0].alertBeforeDays,
            items: alertItems.map((alertItem) => ({
              ...alertItem,
              type: pkiItemTypeToNameMap[alertItem.type],
              expiryDate: new Date(alertItem.expiryDate).toString()
            }))
          },
          template: SmtpTemplates.PkiExpirationAlert
        });
      }
    }
  };

  const createPkiAlert = async ({
    projectId: preSplitProjectId,
    name,
    pkiCollectionId,
    alertBeforeDays,
    emails,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateAlertDTO) => {
    let projectId = preSplitProjectId;
    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );
    if (certManagerProjectFromSplit) {
      projectId = certManagerProjectFromSplit.id;
    }

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbidOnInvalidProjectType(ProjectType.CertificateManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts);

    const pkiCollection = await pkiCollectionDAL.findById(pkiCollectionId);
    if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${pkiCollectionId}' not found` });
    if (pkiCollection.projectId !== projectId)
      throw new ForbiddenRequestError({ message: "PKI collection does not belong to the specified project." });

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
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

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
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbidOnInvalidProjectType(ProjectType.CertificateManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts);

    if (pkiCollectionId) {
      const pkiCollection = await pkiCollectionDAL.findById(pkiCollectionId);
      if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${pkiCollectionId}' not found` });
      if (pkiCollection.projectId !== alert.projectId) {
        throw new ForbiddenRequestError({ message: "PKI collection does not belong to the specified project." });
      }
    }

    alert = await pkiAlertDAL.updateById(alertId, {
      name,
      alertBeforeDays,
      ...(pkiCollectionId && { pkiCollectionId }),
      ...(emails && { recipientEmails: emails.join(",") })
    });

    return alert;
  };

  const deletePkiAlert = async ({ alertId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteAlertDTO) => {
    let alert = await pkiAlertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const { permission, ForbidOnInvalidProjectType } = await permissionService.getProjectPermission(
      actor,
      actorId,
      alert.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbidOnInvalidProjectType(ProjectType.CertificateManager);

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts);
    alert = await pkiAlertDAL.deleteById(alertId);
    return alert;
  };

  return {
    sendPkiItemExpiryNotices,
    createPkiAlert,
    getPkiAlertById,
    updatePkiAlert,
    deletePkiAlert
  };
};
