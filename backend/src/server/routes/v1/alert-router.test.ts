import { z } from "zod";

import { registerAlertRouter } from "./alert-router";

type TRoute = { method: string; url: string; schema: { body?: z.ZodTypeAny } };

const getTestChannelBodySchema = async () => {
  const routes: TRoute[] = [];
  await registerAlertRouter({ route: (route: TRoute) => routes.push(route) } as unknown as FastifyZodProvider);
  const schema = routes.find((route) => route.method === "POST" && route.url === "/channels/test")?.schema.body;
  if (!schema) throw new Error("POST /channels/test has no body schema");
  return schema;
};

describe("POST /api/v1/alerts/channels/test", () => {
  test("trims the description before checking its length", async () => {
    const body = await getTestChannelBodySchema();
    const parse = (description: string) =>
      body.safeParse({ resourceType: "cert-manager.application", channelType: "webhook", description });

    expect(parse(`${"x".repeat(1000)}\n `)).toMatchObject({ success: true, data: { description: "x".repeat(1000) } });
    expect(parse("x".repeat(1001)).success).toBe(false);
  });
});
