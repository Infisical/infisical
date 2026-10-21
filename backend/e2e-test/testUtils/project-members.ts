import { ProjectMembershipRole } from "@app/db/schemas";

import { request } from "./request";

export const listAvailableProjectUsers = (dto: { projectId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `/api/v1/projects/${dto.projectId}/memberships/available-users`,
      headers: { authorization: `Bearer ${dto.authToken}` }
    },
    (res) => res.json().users as { id: string; username: string }[]
  );

export const listAvailableProjectIdentities = (dto: { projectId: string; authToken: string }) =>
  request(
    {
      method: "GET",
      url: `/api/v1/projects/${dto.projectId}/memberships/available-identities`,
      headers: { authorization: `Bearer ${dto.authToken}` },
      query: { limit: "1000" }
    },
    (res) => res.json().identities as { id: string; name: string }[]
  );

export const inviteUsersToProject = (dto: { projectId: string; usernames: string[]; authToken: string }) =>
  request(
    {
      method: "POST",
      url: `/api/v1/projects/${dto.projectId}/memberships`,
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: { usernames: dto.usernames, roleSlugs: [ProjectMembershipRole.Member] }
    },
    (res) => res.json().memberships as { id: string }[]
  );
