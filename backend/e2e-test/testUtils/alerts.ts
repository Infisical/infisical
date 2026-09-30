import { request } from "./request";

type TAlertRecord = {
  id: string;
  name: string;
  channels: {
    id: string;
    name: string;
    channelType: string;
    enabled: boolean;
    recipients: { principalType: string; principalId: string }[];
  }[];
};

export const listAlerts = (dto: { resourceType: string; projectId: string; resourceId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: "/api/v1/alerts",
      headers: { authorization: `Bearer ${dto.authToken}` },
      query: { resourceType: dto.resourceType, projectId: dto.projectId, resourceId: dto.resourceId }
    },
    (res) => {
      expect(res.statusCode).toBe(200);
      return res.json<{ alerts: TAlertRecord[] }>().alerts;
    }
  );

export const updateAlert = (dto: { alertId: string; body: Record<string, unknown>; authToken: string }) =>
  request(
    {
      method: "PATCH",
      url: `/api/v1/alerts/${dto.alertId}`,
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: dto.body
    },
    (res) => {
      expect(res.statusCode).toBe(200);
      return res.json<{ alert: TAlertRecord }>().alert;
    }
  );
