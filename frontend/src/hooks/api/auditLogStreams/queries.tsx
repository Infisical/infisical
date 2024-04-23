import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAuditLogStream } from "./types";

export const auditLogStreamKeys = {
	list: (projectSlug: string) => ["audit-log-stream", { projectSlug }],
	getById: (id: string) => ["audit-log-stream-details", { id }]
};

const fetchAuditLogStreams = async (projectSlug: string) => {
	const { data } = await apiRequest.get<{ auditLogStreams: TAuditLogStream[] }>(
		"/api/v1/audit-log-streams",
		{
			params: {
				projectSlug
			}
		}
	);

	return data.auditLogStreams;
};

export const useGetAuditLogStreams = (projectSlug: string) =>
	useQuery({
		queryKey: auditLogStreamKeys.list(projectSlug),
		queryFn: () => fetchAuditLogStreams(projectSlug),
		enabled: Boolean(projectSlug)
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
