import { requestContext } from "@fastify/request-context";
import opentelemetry from "@opentelemetry/api";
import fp from "fastify-plugin";

export const apiMetrics = fp(async (fastify) => {
  const apiMeter = opentelemetry.metrics.getMeter("API");

  const latencyHistogram = apiMeter.createHistogram("API_latency", {
    unit: "ms"
  });

  const infisicalMeter = opentelemetry.metrics.getMeter("Infisical");

  const requestCounter = infisicalMeter.createCounter("infisical.http.server.request.count", {
    description: "Total number of API requests to Infisical (covers both human users and machine identities)",
    unit: "{request}"
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const { method } = request;
    const route = request.routerPath;
    const { statusCode } = reply;

    // Record latency
    latencyHistogram.record(reply.elapsedTime, {
      route,
      method,
      statusCode
    });

    // Get context data
    const orgId = requestContext.get("orgId");
    const orgName = requestContext.get("orgName");
    const userAuthInfo = requestContext.get("userAuthInfo");
    const identityAuthInfo = requestContext.get("identityAuthInfo");
    const projectDetails = requestContext.get("projectDetails");

    // Build attributes object
    const attributes: Record<string, string | number> = {
      "http.request.method": method,
      "http.route": route,
      "http.response.status_code": statusCode
    };

    // Add organization info
    if (orgId) {
      attributes["infisical.organization.id"] = orgId;
    }
    if (orgName) {
      attributes["infisical.organization.name"] = orgName;
    }

    // Add user info (for human users)
    if (userAuthInfo) {
      if (userAuthInfo.userId) {
        attributes["infisical.user.id"] = userAuthInfo.userId;
      }
      if (userAuthInfo.email) {
        attributes["infisical.user.email"] = userAuthInfo.email;
      }
    }

    // Add identity info (for machine identities)
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

    // Add project info
    if (projectDetails) {
      if (projectDetails.id) {
        attributes["infisical.project.id"] = projectDetails.id;
      }
      if (projectDetails.name) {
        attributes["infisical.project.name"] = projectDetails.name;
      }
    }

    // Add user agent
    const userAgent = request.headers["user-agent"];
    if (userAgent) {
      attributes["user_agent.original"] = userAgent;
    }

    // Add client IP address
    if (request.realIp) {
      attributes["client.address"] = request.realIp;
    }

    requestCounter.add(1, attributes);
  });
});
