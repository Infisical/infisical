import { z } from "zod";

import { registerAlertRouter } from "./alert-router";

type TRoute = { method: string; url: string; schema: { body?: z.ZodTypeAny } };

const getBodySchema = async (method: string, url: string) => {
  const routes: TRoute[] = [];
  await registerAlertRouter({ route: (route: TRoute) => routes.push(route) } as unknown as FastifyZodProvider);
  const schema = routes.find((route) => route.method === method && route.url === url)?.schema.body;
  if (!schema) throw new Error(`${method} ${url} has no body schema`);
  return schema;
};

const PADDED_AT_LIMIT = `${"x".repeat(1000)}\n `;
const OVER_LIMIT = "x".repeat(1001);

describe("alert description", () => {
  test.each([
    {
      route: "POST /api/v1/alerts",
      method: "POST",
      url: "/",
      body: {
        name: "expiry",
        resourceType: "cert-manager.application",
        eventType: "expiration",
        channels: [{ name: "ops", channelType: "webhook" }]
      }
    },
    { route: "PATCH /api/v1/alerts/:alertId", method: "PATCH", url: "/:alertId", body: {} },
    {
      route: "POST /api/v1/alerts/channels/test",
      method: "POST",
      url: "/channels/test",
      body: { resourceType: "cert-manager.application", channelType: "webhook" }
    }
  ])("$route trims the description before checking its length", async ({ method, url, body }) => {
    const schema = await getBodySchema(method, url);
    const parse = (description: string) => schema.safeParse({ ...body, description });

    expect(parse(PADDED_AT_LIMIT)).toMatchObject({ success: true, data: { description: "x".repeat(1000) } });
    expect(parse(OVER_LIMIT).success).toBe(false);
  });
});
