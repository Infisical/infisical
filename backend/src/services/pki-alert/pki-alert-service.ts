import { ProjectType } from "@app/db/schemas";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { pkiItemTypeToNameMap } from "@app/services/pki-collection/pki-collection-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TPkiAlertDALFactory } from "./pki-alert-dal";
import { TCreateAlertDTO, TDeleteAlertDTO, TGetAlertByIdDTO, TUpdateAlertDTO } from "./pki-alert-types";

type TPkiAlertServiceFactoryDep = {
  pkiAlertDAL: Pick<
    TPkiAlertDALFactory,
    "create" | "findById" | "updateById" | "deleteById" | "getExpiringPkiCollectionItemsForAlerting"
  >;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "findById">;
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TPkiAlertServiceFactory = ReturnType<typeof pkiAlertServiceFactory>;

export const pkiAlertServiceFactory = ({
  pkiAlertDAL,
  pkiCollectionDAL,
  projectsDomain,
  smtpService
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
    projectId,
    name,
    pkiCollectionId,
    alertBeforeDays,
    emails,
    actor
  }: TCreateAlertDTO) => {
    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({ action: ProjectPermissionActions.Create, subject: ProjectPermissionSub.PkiAlerts });

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

  const getPkiAlertById = async ({ alertId, actor }: TGetAlertByIdDTO) => {
    const alert = await pkiAlertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: alert.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({ action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.PkiAlerts });
    return alert;
  };

  const updatePkiAlert = async ({
    alertId,
    name,
    pkiCollectionId,
    alertBeforeDays,
    emails,
    actor
  }: TUpdateAlertDTO) => {
    let alert = await pkiAlertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: alert.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.PkiAlerts });

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

  const deletePkiAlert = async ({ alertId, actor }: TDeleteAlertDTO) => {
    let alert = await pkiAlertDAL.findById(alertId);
    if (!alert) throw new NotFoundError({ message: `Alert with ID '${alertId}' not found` });

    const permission = await projectsDomain.getProjectPermission({
      actor,
      projectId: alert.projectId,
      type: ProjectType.CertificateManager
    });

    permission.assert({ action: ProjectPermissionActions.Delete, subject: ProjectPermissionSub.PkiAlerts });
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
