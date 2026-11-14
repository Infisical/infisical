import type { InfiniteData } from "@tanstack/react-query";

import type { TRecentAnnouncementsResponse } from "@app/hooks/api/announcement/types";
import type { AuditLog, TGetAuditLogsFilter } from "@app/hooks/api/auditLogs/types";
import type {
  AddIncidentContactDTO,
  DeleteIncidentContactDTO,
  IncidentContact
} from "@app/hooks/api/incidentContacts/types";
import type {
  Organization,
  TOrgProductStats,
  UpdateOrgDTO
} from "@app/hooks/api/organization/types";
import type { TOrgRole } from "@app/hooks/api/roles/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type V4InfiniteQueryResult<TPage> = V4QueryResult<InfiniteData<TPage>> & {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  refetch: () => Promise<unknown>;
};

export type OrgAdapter = {
  useLogout: V4Mutation<void>;
  getSessionToken: () => string;
  useAnnouncements: () => V4QueryResult<TRecentAnnouncementsResponse>;
  useMarkAnnouncementSeen: V4Mutation<string, string | null>;
  useOrganization: (orgId: string) => V4QueryResult<Organization>;
  useProductStats: (orgId: string) => V4QueryResult<TOrgProductStats>;
  useUpdateOrganization: V4Mutation<UpdateOrgDTO, object>;
  useRoles: (orgId: string) => V4QueryResult<Pick<TOrgRole, "id" | "name" | "slug">[]>;
  useIncidentContacts: (orgId: string) => V4QueryResult<IncidentContact[]>;
  useAddIncidentContact: V4Mutation<AddIncidentContactDTO, object>;
  useDeleteIncidentContact: V4Mutation<DeleteIncidentContactDTO, object>;
  useAuditLogs: (
    filters: TGetAuditLogsFilter,
    projectId: string | null
  ) => V4InfiniteQueryResult<AuditLog[]>;
};
