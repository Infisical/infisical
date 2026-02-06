import { requestContext } from "@fastify/request-context";
import opentelemetry from "@opentelemetry/api";
import fp from "fastify-plugin";

const apiMeter = opentelemetry.metrics.getMeter("API");

const latencyHistogram = apiMeter.createHistogram("API_latency", {
  unit: "ms"
});

const infisicalMeter = opentelemetry.metrics.getMeter("Infisical");

const requestCounter = infisicalMeter.createCounter("infisical.http.server.request.count", {
  description: "Total number of API requests to Infisical (covers both human users and machine identities)",
  unit: "{request}"
});

const requestDurationHistogram = infisicalMeter.createHistogram("infisical.http.server.request.duration", {
  description: "API request latency",
  unit: "s"
});

export const apiMetrics = fp(async (fastify) => {
  fastify.addHook("onResponse", async (request, reply) => {
    const { method } = request;
    const route = request.routerPath;
    const { statusCode } = reply;

    latencyHistogram.record(reply.elapsedTime, {
      route,
      method,
      statusCode
    });

    const orgId = requestContext.get("orgId");
    const orgName = requestContext.get("orgName");
    const userAuthInfo = requestContext.get("userAuthInfo");
    const identityAuthInfo = requestContext.get("identityAuthInfo");
    const projectDetails = requestContext.get("projectDetails");
    const userAgent = requestContext.get("userAgent");
    const ip = requestContext.get("ip");

    const attributes: Record<string, string | number> = {
      "http.request.method": method,
      "http.route": route,
      "http.response.status_code": statusCode
    };

    if (orgId) {
      attributes["infisical.organization.id"] = orgId;
    }
    if (orgName) {
      attributes["infisical.organization.name"] = orgName;
    }

    if (userAuthInfo) {
      if (userAuthInfo.userId) {
        attributes["infisical.user.id"] = userAuthInfo.userId;
      }
      if (userAuthInfo.email) {
        attributes["infisical.user.email"] = userAuthInfo.email;
      }
    }

    if (identityAuthInfo) {
      if (identityAuthInfo.identityId) {
        attributes["infisical.identity.id"] = identityAuthInfo.identityId;
      }
      if (identityAuthInfo.identityName) {
        attributes["infisical.identity.name"] = identityAuthInfo.identityName;
      }
      if (identityAuthInfo.authMethod) {
        attributes["infisical.auth.method"] = identityAuthInfo.authMethod;
      }
    }

    if (projectDetails) {
      if (projectDetails.id) {
        attributes["infisical.project.id"] = projectDetails.id;
      }
      if (projectDetails.name) {
        attributes["infisical.project.name"] = projectDetails.name;
      }
    }

    if (userAgent) {
      attributes["user_agent.original"] = userAgent;
    }

    if (ip) {
      attributes["client.address"] = ip;
    }

    requestCounter.add(1, attributes);
    requestDurationHistogram.record(reply.elapsedTime / 1000, attributes);
  });
});
