import fp from "fastify-plugin";

/*! https://github.com/pbojinov/request-ip/blob/9501cdf6e73059cc70fc6890adb086348d7cca46/src/index.js.
  MIT License. 2022 Petar Bojinov - petarbojinov+github@gmail.com */
const headersOrder = [
  "cf-connecting-ip", // Cloudflare
  "Cf-Pseudo-IPv4", // Cloudflare
  "x-client-ip", // Most common
  "x-envoy-external-address", // for envoy
  "x-forwarded-for", // Mostly used by proxies
  "fastly-client-ip",
  "true-client-ip", // Akamai and Cloudflare
  "x-real-ip", // Nginx
  "x-cluster-client-ip", // Rackspace LB
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
      if (Array.isArray(forwardedIp)) {
        // eslint-disable-next-line
        req.realIp = forwardedIp[0];
        return;
      }

      if (forwardedIp.includes(",")) {
        // the ip header when placed with load balancers that proxy request
        // will attach the internal ips to header by appending with comma
        // https://github.com/go-chi/chi/blob/master/middleware/realip.go
        const clientIPFromProxy = forwardedIp.slice(0, forwardedIp.indexOf(",")).trim();
        req.realIp = clientIPFromProxy;
        return;
      }
      req.realIp = forwardedIp;
    } else {
      req.realIp = req.ip;
    }
  });
});
