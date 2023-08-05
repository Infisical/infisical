import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@app/config/request";
import {
    AuditLog,
    Actor
} from "./types";
import { EventType, UserAgentType } from "./enums";

export const workspaceKeys = {
    getAuditLogs: (workspaceId: string, filters: {
        eventType?: EventType;
        userAgentType?: UserAgentType;
        actor?: string;
    }) => [{ workspaceId, filters }, "audit-logs"] as const,
    getAuditLogActorFilterOpts: (workspaceId: string) => [{ workspaceId }, "audit-log-actor-filters"] as const
}

export const useGetAuditLogs = (workspaceId: string, filters: {
    eventType?: EventType;
    userAgentType?: UserAgentType;
    actor?: string;
}) => {
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

            const { data } = await apiRequest.get<{ auditLogs: AuditLog[] }>(`/api/v1/workspace/${workspaceId}/audit-logs`, { params });
            return data.auditLogs;
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