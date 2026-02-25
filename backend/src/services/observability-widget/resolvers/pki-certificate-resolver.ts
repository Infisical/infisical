import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

import {
  eventTypesToStatusSet,
  ObservabilityItemStatus,
  ObservabilityResourceType,
  TObservabilityWidgetItem,
  TResolverParams,
  TResolverResult
} from "../observability-widget-types";
import {
  buildScope,
  computeSummary,
  DEFAULT_EXPIRATION_THRESHOLD_DAYS,
  formatExpiresAt,
  getThresholdDate
} from "./resolver-helpers";

export const pkiCertificateResolverFactory = (db: TDbClient) => {
  return async (params: TResolverParams): Promise<TResolverResult> => {
    const { orgId, projectId, eventTypes, thresholds, limit = 50, offset = 0, status } = params;
    const expirationDays = thresholds?.expirationDays ?? DEFAULT_EXPIRATION_THRESHOLD_DAYS;
    const thresholdDate = getThresholdDate(expirationDays);
    const now = new Date();

    const baseQuery = db
      .replicaNode()(TableName.Certificate)
      .join(TableName.Project, `${TableName.Certificate}.projectId`, `${TableName.Project}.id`)
      .join(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .where(`${TableName.Project}.orgId`, orgId)
      .andWhere(`${TableName.Certificate}.status`, "!=", "revoked");

    if (projectId) {
      void baseQuery.andWhere(`${TableName.Certificate}.projectId`, projectId);
    }

    const certificates = await baseQuery
      .clone()
      .select(
        `${TableName.Certificate}.id`,
        `${TableName.Certificate}.friendlyName`,
        `${TableName.Certificate}.commonName`,
        `${TableName.Certificate}.serialNumber`,
        `${TableName.Certificate}.notAfter`,
        `${TableName.Certificate}.notBefore`,
        `${TableName.Certificate}.status`,
        `${TableName.Certificate}.caId`,
        `${TableName.Certificate}.projectId`,
        `${TableName.Project}.name as projectName`,
        `${TableName.Organization}.name as orgName`
      );

    const allItems: TObservabilityWidgetItem[] = [];

    for (const cert of certificates) {
      let itemStatus: ObservabilityItemStatus;
      let statusTooltip: string | null = null;
      const notAfter = new Date(cert.notAfter);

      if (notAfter < now) {
        itemStatus = ObservabilityItemStatus.Failed;
        statusTooltip = "Certificate expired";
      } else if (notAfter < thresholdDate) {
        itemStatus = ObservabilityItemStatus.Pending;
        statusTooltip = formatExpiresAt(notAfter);
      } else {
        itemStatus = ObservabilityItemStatus.Active;
        statusTooltip = null;
      }

      allItems.push({
        id: cert.id,
        resourceType: ObservabilityResourceType.PkiCertificate,
        resourceName: cert.friendlyName || cert.commonName,
        resourceId: cert.id,
        scope: buildScope({
          type: "project",
          projectName: cert.projectName,
          orgName: cert.orgName
        }),
        status: itemStatus,
        statusTooltip,
        eventTimestamp: notAfter,
        resourceLink: `/org/${orgId}/pki/${cert.caId}/certificates/${cert.id}`,
        metadata: {
          serialNumber: cert.serialNumber,
          commonName: cert.commonName,
          notAfter: cert.notAfter,
          notBefore: cert.notBefore,
          certificateStatus: cert.status
        }
      });
    }

    const summary = computeSummary(allItems);

    const statusSet = eventTypesToStatusSet(eventTypes);
    let filteredItems = allItems.filter((item) => statusSet.has(item.status));

    if (status) {
      filteredItems = filteredItems.filter((item) => item.status === status);
    }

    const paginatedItems = filteredItems.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      totalCount: filteredItems.length,
      summary
    };
  };
};
