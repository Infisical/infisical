import { LightMyRequestResponse } from "fastify";

import { request } from "./request";

type TEnvironment = { id: string; name: string; slug: string };

const parseEnvironment = (res: LightMyRequestResponse) => {
  expect(res.statusCode, res.payload).toBe(200);
  return res.json<{ environment: TEnvironment }>().environment;
};

export const createEnvironment = (dto: { projectId: string; name: string; slug: string; authToken: string }) =>
  request(
    {
      method: "POST",
      url: `/api/v1/workspace/${dto.projectId}/environments`,
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: { name: dto.name, slug: dto.slug }
    },
    parseEnvironment
  );

export const deleteEnvironment = (dto: {
  projectId: string;
  environmentId: string;
  hardDelete?: boolean;
  authToken: string;
}) =>
  request(
    {
      method: "DELETE",
      url: `/api/v1/workspace/${dto.projectId}/environments/${dto.environmentId}`,
      headers: { authorization: `Bearer ${dto.authToken}` },
      query: dto.hardDelete === undefined ? {} : { hardDelete: String(dto.hardDelete) }
    },
    parseEnvironment
  );
