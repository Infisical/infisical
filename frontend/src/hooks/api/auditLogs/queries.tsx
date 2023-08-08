import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
    Actor,
    AuditLog,
    AuditLogFilters
} from "./types";

export const workspaceKeys = {
    getAuditLogs: (workspaceId: string, filters: AuditLogFilters) => [{ workspaceId, filters }, "audit-logs"] as const,
    getAuditLogActorFilterOpts: (workspaceId: string) => [{ workspaceId }, "audit-log-actor-filters"] as const
}

export const useGetAuditLogs = (workspaceId: string, filters: AuditLogFilters) => {
    return useQuery({ 
        queryKey: workspaceKeys.getAuditLogs(workspaceId, filters), 
        queryFn: async () => {
            
            const params = new URLSearchParams();
            if (filters.eventType) {
                params.append("eventType", filters.eventType);
            }

            if (filters.userAgentType) {
                params.append("userAgentType", filters.userAgentType); 
            }

            if (filters.actor) {
                params.append("actor", filters.actor); 
            }

            if (filters.startDate) {
                params.append("startDate", filters.startDate.toISOString());
            }

            if (filters.endDate) {
                params.append("endDate", filters.endDate.toISOString());
            }

            params.append("offset", String(filters.offset));
            params.append("limit", String(filters.limit));
            
            const { data } = await apiRequest.get<{ auditLogs: AuditLog[], totalCount: number }>(`/api/v1/workspace/${workspaceId}/audit-logs`, { params });
            return data;
        }
    });
}

export const useGetAuditLogActorFilterOpts = (workspaceId: string) => {
    return useQuery({ 
        queryKey: workspaceKeys.getAuditLogActorFilterOpts(workspaceId), 
        queryFn: async () => {
            const { data } = await apiRequest.get<{ actors: Actor[] }>(`/api/v1/workspace/${workspaceId}/audit-logs/filters/actors`);
            return data.actors;
        }
    });
}