import { LightMyRequestResponse } from "fastify";

import { request } from "./request";

type TAlertRecord = {
  id: string;
  name: string;
  projectId: string | null;
  channels: {
    id: string;
    name: string;
    channelType: string;
    enabled: boolean;
    recipients: { principalType: string; principalId: string }[];
  }[];
};

const parseAlert = (res: LightMyRequestResponse) => {
  expect(res.statusCode).toBe(200);
  return res.json<{ alert: TAlertRecord }>().alert;
};

export const createAlert = (dto: { body: Record<string, unknown>; authToken: string }) =>
  request(
    {
      method: "POST",
      url: "/api/v1/alerts",
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: dto.body
    },
    parseAlert
  );

export const getAlert = (dto: { alertId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `/api/v1/alerts/${dto.alertId}`,
      headers: { authorization: `Bearer ${dto.authToken}` }
    },
    parseAlert
  );

export const listAlerts = (dto: { resourceType: string; projectId?: string; resourceId?: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: "/api/v1/alerts",
      headers: { authorization: `Bearer ${dto.authToken}` },
      query: {
        resourceType: dto.resourceType,
        ...(dto.projectId ? { projectId: dto.projectId } : {}),
        ...(dto.resourceId ? { resourceId: dto.resourceId } : {})
      }
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
    parseAlert
  );

export const deleteAlert = (dto: { alertId: string; authToken: string }) =>
  request(
    {
      method: "DELETE",
      url: `/api/v1/alerts/${dto.alertId}`,
      headers: { authorization: `Bearer ${dto.authToken}` }
    },
    (res) => {
      expect(res.statusCode).toBe(200);
    }
  );
