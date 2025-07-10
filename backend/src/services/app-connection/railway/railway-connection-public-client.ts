/* eslint-disable class-methods-use-this */
import { AxiosError, AxiosInstance, AxiosResponse } from "axios";

import { createRequestClient } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { RailwayConnectionMethod } from "./railway-connection-constants";
import {
  RailwayAccountWorkspaceListSchema,
  RailwayGetProjectsByProjectTokenSchema,
  RailwayGetSubscriptionTypeSchema,
  RailwayProjectsListSchema
} from "./railway-connection-schemas";
import { RailwayProject, TRailwayConnectionConfig, TRailwayResponse } from "./railway-connection-types";

type RailwaySendReqOptions = Pick<TRailwayConnectionConfig, "credentials" | "method">;

export function getRailwayAuthHeaders(method: RailwayConnectionMethod, token: string): Record<string, string> {
  switch (method) {
    case RailwayConnectionMethod.AccountToken:
    case RailwayConnectionMethod.TeamToken:
      return {
        Authorization: token
      };
    case RailwayConnectionMethod.ProjectToken:
      return {
        "Project-Access-Token": token
      };
    default:
      throw new Error(`Unsupported Railway connection method`);
  }
}

export function getRailwayRatelimiter(headers: AxiosResponse["headers"]): {
  isRatelimited: boolean;
  maxAttempts: number;
  wait: () => Promise<void>;
} {
  const retryAfter: number | undefined = headers["Retry-After"] as number | undefined;
  const requestsLeft = parseInt(headers["X-RateLimit-Remaining"] as string, 10);
  const limitResetAt = headers["X-RateLimit-Reset"] as string;

  const now = +new Date();
  const nextReset = +new Date(limitResetAt);

  const remaining = Math.min(0, nextReset - now);

  const wait = () => {
    return new Promise<void>((res) => {
      setTimeout(res, remaining);
    });
  };

  return {
    isRatelimited: Boolean(retryAfter || requestsLeft === 0),
    wait,
    maxAttempts: 3
  };
}

class RailwayPublicClient {
  private client: AxiosInstance;

  constructor() {
    this.client = createRequestClient({
      method: "POST",
      baseURL: IntegrationUrls.RAILWAY_API_URL,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  async send<T extends TRailwayResponse>(
    query: string,
    options: RailwaySendReqOptions,
    variables: Record<string, string | Record<string, string>> = {},
    retryAttempt: number = 0
  ): Promise<T["data"] | undefined> {
    const body = {
      query,
      variables
    };

    const response = await this.client.request<T>({
      data: body,
      headers: getRailwayAuthHeaders(options.method, options.credentials.apiToken)
    });

    const { errors } = response.data;

    if (Array.isArray(errors) && errors.length > 0) {
      throw new AxiosError(errors[0].message);
    }

    const limiter = getRailwayRatelimiter(response.headers);

    if (limiter.isRatelimited && retryAttempt <= limiter.maxAttempts) {
      await limiter.wait();
      return this.send(query, options, variables, retryAttempt + 1);
    }

    return response.data.data;
  }

  healthcheck(config: RailwaySendReqOptions) {
    switch (config.method) {
      case RailwayConnectionMethod.AccountToken:
        return this.send(`{ me { teams { edges { node { id } } } } }`, config);
      case RailwayConnectionMethod.ProjectToken:
        return this.send(`{ projectToken { projectId environmentId project { id } } }`, config);
      case RailwayConnectionMethod.TeamToken:
        return this.send(`{ projects { edges { node { id name team { id } } } } }`, config);
      default:
        throw new Error(`Unsupported Railway connection method`);
    }
  }

  async getSubscriptionType(config: RailwaySendReqOptions & { projectId: string }) {
    const res = await this.send(
      `query project($projectId: String!) { project(id: $projectId) { subscriptionType }}`,
      config,
      {
        projectId: config.projectId
      }
    );

    const data = await RailwayGetSubscriptionTypeSchema.parseAsync(res);

    return data.project.subscriptionType;
  }

  async listProjects(config: RailwaySendReqOptions): Promise<RailwayProject[]> {
    switch (config.method) {
      case RailwayConnectionMethod.TeamToken: {
        const res = await this.send(
          `{ projects { edges { node { id, name, services{ edges{ node { id, name } } } environments { edges { node { name, id } } } } } } }`,
          config
        );

        const data = await RailwayProjectsListSchema.parseAsync(res);

        return data.projects.edges.map((p) => ({
          id: p.node.id,
          name: p.node.name,
          environments: p.node.environments.edges.map((e) => e.node),
          services: p.node.services.edges.map((s) => s.node)
        }));
      }

      case RailwayConnectionMethod.AccountToken: {
        const res = await this.send(
          `{ me { workspaces { id, name, team{ projects{ edges{ node{ id, name, services{ edges { node { name, id } } } environments { edges { node { name, id } } } } } } } } } }`,
          config
        );

        const data = await RailwayAccountWorkspaceListSchema.parseAsync(res);

        return data.me.workspaces.flatMap((w) =>
          w.team.projects.edges.map((p) => ({
            id: p.node.id,
            name: p.node.name,
            environments: p.node.environments.edges.map((e) => e.node),
            services: p.node.services.edges.map((s) => s.node)
          }))
        );
      }

      case RailwayConnectionMethod.ProjectToken: {
        const res = await this.send(
          `query { projectToken { project { id, name, services { edges { node { name, id } } } environments { edges { node { name, id } } } } } }`,
          config
        );

        const data = await RailwayGetProjectsByProjectTokenSchema.parseAsync(res);

        const p = data.projectToken.project;

        return [
          {
            id: p.id,
            name: p.name,
            environments: p.environments.edges.map((e) => e.node),
            services: p.services.edges.map((s) => s.node)
          }
        ];
      }

      default:
        throw new Error(`Unsupported Railway connection method`);
    }
  }

  async getVariables(
    config: RailwaySendReqOptions,
    variables: { projectId: string; environmentId: string; serviceId?: string }
  ) {
    const res = await this.send<TRailwayResponse<{ variables: Record<string, string> }>>(
      `query variables($environmentId: String!, $projectId: String!, $serviceId: String) { variables( projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId ) }`,
      config,
      variables
    );

    if (!res?.variables) {
      throw new BadRequestError({
        message: "Failed to get railway variables - empty response"
      });
    }

    return res.variables;
  }

  async deleteVariable(
    config: RailwaySendReqOptions,
    variables: { input: { projectId: string; environmentId: string; name: string; serviceId?: string } }
  ) {
    await this.send<TRailwayResponse<{ variables: Record<string, string> }>>(
      `mutation variableDelete($input: VariableDeleteInput!) { variableDelete(input: $input) }`,
      config,
      variables
    );
  }

  async upsertVariable(
    config: RailwaySendReqOptions,
    variables: { input: { projectId: string; environmentId: string; name: string; value: string; serviceId?: string } }
  ) {
    await this.send<TRailwayResponse<{ variables: Record<string, string> }>>(
      `mutation variableUpsert($input: VariableUpsertInput!) { variableUpsert(input: $input) }`,
      config,
      variables
    );
  }
}

export const RailwayPublicAPI = new RailwayPublicClient();
