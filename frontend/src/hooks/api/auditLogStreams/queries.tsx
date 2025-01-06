import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAuditLogStream } from "./types";

export const auditLogStreamKeys = {
  list: (orgId: string) => ["audit-log-stream", { orgId }],
  getById: (id: string) => ["audit-log-stream-details", { id }]
};

const fetchAuditLogStreams = async () => {
  const { data } = await apiRequest.get<{ auditLogStreams: TAuditLogStream[] }>(
    "/api/v1/audit-log-streams"
  );

  return data.auditLogStreams;
};

export const useGetAuditLogStreams = (orgId: string) =>
  useQuery({
    queryKey: auditLogStreamKeys.list(orgId),
    queryFn: () => fetchAuditLogStreams(),
    enabled: Boolean(orgId)
  });

const fetchAuditLogStreamDetails = async (id: string) => {
  const { data } = await apiRequest.get<{ auditLogStream: TAuditLogStream }>(
    `/api/v1/audit-log-streams/${id}`
  );

  return data.auditLogStream;
};

export const useGetAuditLogStreamDetails = (id: string) =>
  useQuery({
    queryKey: auditLogStreamKeys.getById(id),
    queryFn: () => fetchAuditLogStreamDetails(id),
    enabled: Boolean(id)
  });
