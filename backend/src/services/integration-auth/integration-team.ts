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

  let page = 1;
  const perPage = 10;
  let hasMorePages = true;

  while (hasMorePages) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage)
    });

    const { data } = await request.get<{ name: string; id: string }[]>(
      `${gitLabApiUrl}/v4/groups`,
      {
        params,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Encoding": "application/json"
        }
      }
    );

    data.forEach((a) => {
      teams.push({
        name: a.name,
        id: a.id.toString()
      });
    });

    if (data.length < perPage) {
      hasMorePages = false;
    }

    page += 1;
  }

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
