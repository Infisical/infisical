import { z } from "zod";

import { SSHAuthMethod } from "@app/hooks/api/pam/types/ssh-resource";

export const BaseSshConnectionDetailsSchema = z.object({
  host: z.string().trim().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535)
});

export const SSHPasswordCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.Password),
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().trim().min(1, "Password is required")
});

export const SSHPublicKeyCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.PublicKey),
  username: z.string().trim().min(1, "Username is required"),
  privateKey: z.string().trim().min(1, "Private key is required")
});

export const SSHCertificateCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.Certificate),
  username: z.string().trim().min(1, "Username is required")
});

export const BaseSshAccountSchema = z.discriminatedUnion("authMethod", [
  SSHPasswordCredentialsSchema,
  SSHPublicKeyCredentialsSchema,
  SSHCertificateCredentialsSchema
]);
