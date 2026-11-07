import { useGetRecentAnnouncements, useMarkAnnouncementSeen } from "@app/hooks/api/announcement";
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
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { useGetOrgRoles } from "@app/hooks/api/roles/queries";
import { useLogoutUser } from "@app/hooks/api/users/queries";

import type { OrgAdapter } from "./contract";

export const orgLive: OrgAdapter = {
  useLogout: useLogoutUser,
  getSessionToken: getAuthToken,
  useAnnouncements: useGetRecentAnnouncements,
  useMarkAnnouncementSeen,
  useOrganization: useGetOrganizationById,
  useProductStats: useGetOrgProductStats,
  useUpdateOrganization: useUpdateOrg,
  useRoles: useGetOrgRoles,
  useIncidentContacts: useGetOrgIncidentContact,
  useAddIncidentContact,
  useDeleteIncidentContact,
  useAuditLogs: useGetAuditLogs
};
