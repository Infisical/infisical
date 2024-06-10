import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";

import { Integrations, IntegrationUrls } from "./integration-list";

type Team = {
  name: string;
  id: string;
};
const getTeamsGitLab = async ({ url, accessToken }: { url: string; accessToken: string }) => {
  const gitLabApiUrl = url ? `${url}/api` : IntegrationUrls.GITLAB_API_URL;

  let teams: Team[] = [];
  const res = (
    await request.get<{ name: string; id: string }[]>(`${gitLabApiUrl}/v4/groups`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Encoding": "application/json"
      }
    })
  ).data;

  teams = res.map((t) => ({
    name: t.name,
    id: t.id.toString()
  }));

  return teams;
};

export const getTeams = async ({
  accessToken,
  url,
  integration
}: {
  accessToken: string;
  url?: string;
  integration: string;
}) => {
  switch (integration) {
    case Integrations.GITLAB:
      return getTeamsGitLab({
        url: url as string,
        accessToken
      });
    default:
      throw new BadRequestError({ message: "Integration doesn't have team support" });
  }
};
