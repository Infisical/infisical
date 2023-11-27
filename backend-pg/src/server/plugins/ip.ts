import fp from "fastify-plugin";

/*! https://github.com/pbojinov/request-ip/blob/9501cdf6e73059cc70fc6890adb086348d7cca46/src/index.js.
  MIT License. 2022 Petar Bojinov - petarbojinov+github@gmail.com */
const headersOrder = [
  "x-client-ip", // Most common
  "x-forwarded-for", // Mostly used by proxies
  "cf-connecting-ip", // Cloudflare
  "Cf-Pseudo-IPv4", // Cloudflare
  "fastly-client-ip",
  "true-client-ip", // Akamai and Cloudflare
  "x-real-ip", // Nginx
  "x-cluser-client-ip", // Rackspace LB
  "forwarded-for",
  "x-forwarded",
  "forwarded",
  "x-appengine-user-ip" // GCP App Engine
];

export const fastifyIp = fp(async (fastify) => {
  fastify.decorateRequest("realIp", null);
  fastify.addHook("onRequest", async (req) => {
    const forwardedIpHeader = headersOrder.find((header) => Boolean(req.headers[header]));
    const forwardedIp = forwardedIpHeader ? req.headers[forwardedIpHeader] : undefined;
    if (forwardedIp) {
      req.realIp = Array.isArray(forwardedIp) ? forwardedIp[0] : forwardedIp;
    } else {
      req.realIp = req.ip;
    }
  });
});
