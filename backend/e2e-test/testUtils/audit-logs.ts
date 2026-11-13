import { EventType } from "@app/ee/services/audit-log/audit-log-types";

import { pollUntil } from "./poll";
import { request } from "./request";

// Audit logs reach the database through a Redis stream drained every few seconds, so a spec waits for
// them. Recording needs the auditLogs plan feature and a retention above zero (see overrideLicenseFeatures).

export type TAuditLog = {
  id: string;
  createdAt: string;
  event: { type: string; metadata: Record<string, unknown> };
  actor: { type: string; metadata: Record<string, unknown> };
};

export const listAuditLogs = (dto: {
  authToken: string;
  projectId: string;
  eventTypes: EventType[];
  startDate: Date;
}) =>
  request(
    {
      method: "GET",
      url: "/api/v1/organization/audit-logs",
      headers: { authorization: `Bearer ${dto.authToken}` },
      query: {
        projectId: dto.projectId,
        eventType: dto.eventTypes.join(","),
        startDate: dto.startDate.toISOString(),
        limit: "1000"
      }
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<{ auditLogs: TAuditLog[] }>().auditLogs;
    }
  );

export const waitForAuditLog = (dto: {
  authToken: string;
  projectId: string;
  eventType: EventType;
  startDate: Date;
  describe: string;
  match: (log: TAuditLog) => boolean;
}) =>
  pollUntil({
    describe: `a '${dto.eventType}' audit log for ${dto.describe}`,
    read: async () => (await listAuditLogs({ ...dto, eventTypes: [dto.eventType] })).filter(dto.match),
    done: (logs) => logs.length > 0
  });

// The stream is drained in order, so once an event written now shows up, every event written before
// it has been stored too. Call this before asserting that an event was *not* recorded. The marker is a
// read of the certificate, and an entry's createdAt is stamped when it is written to the stream.
export const flushAuditLogs = async (dto: { authToken: string; projectId: string; certificateId: string }) => {
  const startDate = new Date();
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/cert-manager/certificates/${dto.certificateId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });
  expect(res.statusCode, res.payload).toBe(200);

  await waitForAuditLog({
    ...dto,
    eventType: EventType.GET_CERT,
    startDate,
    describe: "the marker read, so the stream has drained past it",
    match: (log) => log.event.metadata.certId === dto.certificateId
  });
};
