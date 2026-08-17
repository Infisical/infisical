import { z } from "zod";

import { ResourceAuthMethodType } from "./resource-auth-method-fns";

export const AwsAuthMethodConfigSchema = z.object({
  id: z.string().uuid(),
  stsEndpoint: z.string(),
  allowedPrincipalArns: z.string(),
  allowedAccountIds: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const KubernetesAuthMethodConfigSchema = z.object({
  id: z.string().uuid(),
  kubernetesHost: z.string(),
  tokenReviewMode: z.string(),
  gatewayId: z.string().nullable(),
  gatewayPoolId: z.string().nullable(),
  allowedNamespaces: z.string(),
  allowedNames: z.string(),
  allowedAudience: z.string(),
  verifyTlsCertificate: z.boolean(),
  caCertificate: z.string(),
  hasTokenReviewerJwt: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const TokenAuthMethodConfigSchema = z.object({});

export const IdentityAuthMethodConfigSchema = z.object({
  identityId: z.string(),
  identityName: z.string().nullable()
});

export const AuthMethodViewSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal(ResourceAuthMethodType.Aws), config: AwsAuthMethodConfigSchema }),
  z.object({ method: z.literal(ResourceAuthMethodType.Kubernetes), config: KubernetesAuthMethodConfigSchema }),
  z.object({ method: z.literal(ResourceAuthMethodType.Token), config: TokenAuthMethodConfigSchema }),
  z.object({ method: z.literal(ResourceAuthMethodType.Identity), config: IdentityAuthMethodConfigSchema })
]);
