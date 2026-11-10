import { useInfiniteQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useGetRecentAnnouncements, useMarkAnnouncementSeen } from "@app/hooks/api/announcement";
import { auditLogKeys } from "@app/hooks/api/auditLogs/queries";
import type { AuditLog } from "@app/hooks/api/auditLogs/types";
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
import { getAuthToken, onRequestError } from "@app/hooks/api/reactQuery";
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
  useAuditLogs: (filters, projectId) =>
    useInfiniteQuery({
      initialPageParam: 0,
      queryKey: [...auditLogKeys.getAuditLogs(projectId, filters), "v4"],
      queryFn: async ({ pageParam }) => {
        try {
          const { data } = await apiRequest.get<{ auditLogs: AuditLog[] }>(
            "/api/v1/organization/audit-logs",
            {
              params: {
                ...filters,
                offset: pageParam,
                startDate: filters.startDate.toISOString(),
                endDate: filters.endDate.toISOString(),
                ...(filters.eventType?.length ? { eventType: filters.eventType.join(",") } : {}),
                ...(filters.eventClass?.length ? { eventClass: filters.eventClass.join(",") } : {}),
                ...(projectId ? { projectId } : {})
              }
            }
          );
          return data.auditLogs;
        } catch (error) {
          onRequestError(error);
          throw error;
        }
      },
      getNextPageParam: (lastPage, pages) =>
        lastPage.length !== 0 ? pages.length * filters.limit : undefined,
      placeholderData: (prev) => prev,
      retry: false
    })
};
