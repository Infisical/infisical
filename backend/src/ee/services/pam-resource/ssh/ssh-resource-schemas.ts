import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreateGatewayPamResourceSchema,
  BaseCreatePamAccountSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdateGatewayPamResourceSchema,
  BaseUpdatePamAccountSchema
} from "../pam-resource-schemas";
import { SSHAuthMethod } from "./ssh-resource-enums";

export const BaseSSHResourceSchema = BasePamResourceSchema.extend({ resourceType: z.literal(PamResource.SSH) });

export const SSHResourceListItemSchema = z.object({
  name: z.literal("SSH"),
  resource: z.literal(PamResource.SSH)
});

export const SSHResourceConnectionDetailsSchema = z.object({
  host: z.string().trim().max(255),
  port: z.number()
});

export const SSHPasswordCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.Password),
  username: z.string().trim().max(255),
  password: z.string().trim().max(255)
});

export const SSHPublicKeyCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.PublicKey),
  username: z.string().trim().max(255),
  privateKey: z.string().trim().max(5000)
});

export const SSHCertificateCredentialsSchema = z.object({
  authMethod: z.literal(SSHAuthMethod.Certificate),
  username: z.string().trim().max(255)
});

export const SSHAccountCredentialsSchema = z.discriminatedUnion("authMethod", [
  SSHPasswordCredentialsSchema,
  SSHPublicKeyCredentialsSchema,
  SSHCertificateCredentialsSchema
]);

export const SSHResourceSchema = BaseSSHResourceSchema.extend({
  connectionDetails: SSHResourceConnectionDetailsSchema,
  rotationAccountCredentials: SSHAccountCredentialsSchema.nullable().optional()
});

export const SanitizedSSHResourceSchema = BaseSSHResourceSchema.extend({
  connectionDetails: SSHResourceConnectionDetailsSchema,
  rotationAccountCredentials: z
    .discriminatedUnion("authMethod", [
      z.object({
        authMethod: z.literal(SSHAuthMethod.Password),
        username: z.string()
      }),
      z.object({
        authMethod: z.literal(SSHAuthMethod.PublicKey),
        username: z.string()
      }),
      z.object({
        authMethod: z.literal(SSHAuthMethod.Certificate),
        username: z.string()
      })
    ])
    .nullable()
    .optional()
});

export const CreateSSHResourceSchema = BaseCreateGatewayPamResourceSchema.extend({
  connectionDetails: SSHResourceConnectionDetailsSchema,
  rotationAccountCredentials: SSHAccountCredentialsSchema.nullable().optional()
});

export const UpdateSSHResourceSchema = BaseUpdateGatewayPamResourceSchema.extend({
  connectionDetails: SSHResourceConnectionDetailsSchema.optional(),
  rotationAccountCredentials: SSHAccountCredentialsSchema.nullable().optional()
});

// Accounts
export const SSHAccountSchema = BasePamAccountSchema.extend({
  credentials: SSHAccountCredentialsSchema
});

export const CreateSSHAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: SSHAccountCredentialsSchema
});

export const UpdateSSHAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: SSHAccountCredentialsSchema.optional()
});

export const SanitizedSSHAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  credentials: z.discriminatedUnion("authMethod", [
    z.object({
      authMethod: z.literal(SSHAuthMethod.Password),
      username: z.string()
    }),
    z.object({
      authMethod: z.literal(SSHAuthMethod.PublicKey),
      username: z.string()
    }),
    z.object({
      authMethod: z.literal(SSHAuthMethod.Certificate),
      username: z.string()
    })
  ])
});

// Sessions
export const SSHSessionCredentialsSchema = SSHResourceConnectionDetailsSchema.and(SSHAccountCredentialsSchema);
