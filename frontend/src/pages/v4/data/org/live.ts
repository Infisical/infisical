import { useGetAuditLogs } from "@app/hooks/api/auditLogs/queries";
import {
  useAddIncidentContact,
  useDeleteIncidentContact,
  useGetOrgIncidentContact
} from "@app/hooks/api/incidentContacts/queries";
import {
  useGetOrganizationById,
  useGetOrgProductStats,
  useUpdateOrg
} from "@app/hooks/api/organization/queries";
import { useGetOrgRoles } from "@app/hooks/api/roles/queries";

import type { OrgAdapter } from "./contract";

export const orgLive: OrgAdapter = {
  useOrganization: useGetOrganizationById,
  useProductStats: useGetOrgProductStats,
  useUpdateOrganization: useUpdateOrg,
  useRoles: useGetOrgRoles,
  useIncidentContacts: useGetOrgIncidentContact,
  useAddIncidentContact,
  useDeleteIncidentContact,
  useAuditLogs: useGetAuditLogs
};
