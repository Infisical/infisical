import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { CircleCIConnectionMethod } from "./circleci-connection-enums";
import { TCircleCIConnection, TCircleCIConnectionConfig, TCircleCIProject } from "./circleci-connection-types";

export const CIRCLECI_API_URL = "https://circleci.com/api/v2";

type TCircleCICollaboration = {
  slug?: string;
};

type TCircleCIPipeline = {
  project_slug?: string;
};

type TCircleCIPipelineListResponse = {
  items: TCircleCIPipeline[];
  next_page_token?: string | null;
};

type TCircleCIProjectResponse = {
  id?: string;
  name?: string;
  slug?: string;
};

export const getCircleCIConnectionListItem = () => {
  return {
    name: "CircleCI" as const,
    app: AppConnection.CircleCI as const,
    methods: Object.values(CircleCIConnectionMethod) as [CircleCIConnectionMethod.PersonalAccessToken]
  };
};

export const validateCircleCIConnectionCredentials = async (config: TCircleCIConnectionConfig) => {
  const { credentials: inputCredentials } = config;

  try {
    // Validate the API token by calling the /me endpoint
    await request.get(`${CIRCLECI_API_URL}/me`, {
      headers: {
        "Circle-Token": inputCredentials.apiToken
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return inputCredentials;
};

export const listCircleCIProjects = async (appConnection: TCircleCIConnection): Promise<TCircleCIProject[]> => {
  const { credentials } = appConnection;
  const { apiToken } = credentials;

  try {
    const { data: collaborations } = await request.get<TCircleCICollaboration[]>(
      `${CIRCLECI_API_URL}/me/collaborations`,
      {
        headers: {
          "Circle-Token": apiToken,
          "Accept-Encoding": "application/json"
        }
      }
    );

    const orgSlugs = collaborations
      .map((org) => org.slug)
      .filter((slug): slug is string => Boolean(slug));

    const projectSlugs = new Set<string>();

    for (const orgSlug of orgSlugs) {
      let nextPageToken: string | undefined;

      do {
        // eslint-disable-next-line no-await-in-loop
        const { data } = await request.get<TCircleCIPipelineListResponse>(`${CIRCLECI_API_URL}/pipeline`, {
          headers: {
            "Circle-Token": apiToken,
            "Accept-Encoding": "application/json"
          },
          params: {
            "org-slug": orgSlug,
            ...(nextPageToken ? { "page-token": nextPageToken } : {})
          }
        });

        data.items.forEach((pipeline) => {
          if (pipeline.project_slug) {
            projectSlugs.add(pipeline.project_slug);
          }
        });

        nextPageToken = data.next_page_token ?? undefined;
      } while (nextPageToken);
    }

    const projects = await Promise.all(
      Array.from(projectSlugs).map(async (slug) => {
        try {
          const { data: project } = await request.get<TCircleCIProjectResponse>(
            `${CIRCLECI_API_URL}/project/${encodeURIComponent(slug)}`,
            {
              headers: {
                "Circle-Token": apiToken,
                "Accept-Encoding": "application/json"
              }
            }
          );

          return {
            id: project.slug || slug,
            name: project.name || slug,
            slug: project.slug || slug
          };
        } catch {
          return {
            id: slug,
            name: slug,
            slug
          };
        }
      })
    );

    return projects;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to fetch CircleCI projects: ${error.message || "Unknown error"}`
      });
    }
    throw error;
  }
};
