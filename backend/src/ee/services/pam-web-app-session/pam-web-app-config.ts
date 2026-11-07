import { isIP } from "node:net";

import { z } from "zod";

const delimited = (value: unknown) =>
  typeof value === "string"
    ? value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : value;

const DestinationSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(/^https?:\/\/(?:\*\.)?(?:[A-Za-z0-9.-]+|\[[A-Fa-f0-9:.]+\])(?::\d{1,5})?$/)
  .refine((value) => {
    try {
      const url = new URL(value.replace("://*.", "://wildcard."));
      return Boolean(url.hostname) && (!url.port || Number(url.port) > 0);
    } catch {
      return false;
    }
  }, "Use scheme://host[:port] with a valid port");

export const destinationFromUrl = (value: string) => {
  const url = new URL(value);
  return {
    host: url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, ""),
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    scheme: url.protocol === "https:" ? ("https" as const) : ("http" as const)
  };
};
const destinationOrigin = (value: string) => {
  const { host, scheme, port } = destinationFromUrl(value);
  return `${scheme}://${host.includes(":") ? `[${host}]` : host}:${port}`;
};
const normalizedDestinations = (value: unknown) => {
  const entries = delimited(value);
  if (!Array.isArray(entries)) return entries;
  return [
    ...new Set(
      entries.map((entry: unknown) => {
        const parsed = DestinationSchema.safeParse(entry);
        return parsed.success ? destinationOrigin(parsed.data) : entry;
      })
    )
  ];
};

export const WebAppConnectionDetailsSchema = z.object({
  startUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    }, "Use an HTTP or HTTPS URL without embedded credentials"),
  allowedDestinations: z.preprocess(normalizedDestinations, z.array(DestinationSchema).max(50).default([])),
  extraDenyCidrs: z.preprocess(
    delimited,
    z
      .array(
        z
          .string()
          .trim()
          .min(3)
          .max(64)
          .refine((value) => {
            const parts = value.split("/");
            const version = isIP(parts[0]);
            return (
              parts.length === 2 &&
              version !== 0 &&
              /^\d{1,3}$/.test(parts[1]) &&
              Number(parts[1]) <= (version === 4 ? 32 : 128)
            );
          }, "Use a valid IPv4 or IPv6 CIDR range")
      )
      .max(20)
      .default([])
  ),
  allowTypedNavigation: z.boolean().default(false)
});

export const WebAppCredentialsSchema = z.discriminatedUnion("authMethod", [
  z.object({ authMethod: z.literal("none") }),
  z.object({
    authMethod: z.literal("basic-auth"),
    username: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(1024)
  })
]);

export const normalizeWebAppConnectionDetails = (value: unknown) => {
  const details = WebAppConnectionDetailsSchema.parse(value);
  return WebAppConnectionDetailsSchema.parse({
    ...details,
    allowedDestinations: [destinationOrigin(details.startUrl), ...details.allowedDestinations]
  });
};

export const buildWebAppPolicySnapshot = (
  connectionDetails: unknown,
  authMethod: "none" | "basic-auth",
  options: { reconnectGraceSeconds: number }
) => {
  const details = normalizeWebAppConnectionDetails(connectionDetails);
  return {
    ...details,
    startOrigin: destinationOrigin(details.startUrl),
    allowedDestinations: details.allowedDestinations.map(destinationFromUrl),
    ...options,
    maxFps: 8 as const,
    jpegQuality: 60 as const,
    maxWidth: 1920 as const,
    maxHeight: 1200 as const,
    authMethod
  };
};

export type TWebAppPolicySnapshot = ReturnType<typeof buildWebAppPolicySnapshot>;
