import opentelemetry from "@opentelemetry/api";
import fp from "fastify-plugin";

export const apiMetrics = fp(async (fastify) => {
  const apiMeter = opentelemetry.metrics.getMeter("API");
  const latencyHistogram = apiMeter.createHistogram("API latency", {
    unit: "ms"
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const { method } = request;
    const route = request.routerPath;
    const { statusCode } = reply;

    latencyHistogram.record(reply.elapsedTime, {
      route,
      method,
      statusCode
    });
  });
});
