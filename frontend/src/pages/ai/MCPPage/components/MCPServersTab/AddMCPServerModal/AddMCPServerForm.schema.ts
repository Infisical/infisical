import { z } from "zod";

export enum MCPServerCredentialMode {
  SHARED = "shared",
  PERSONAL = "personal"
}

export enum MCPServerAuthMethod {
  BASIC = "basic",
  BEARER = "bearer",
  OAUTH = "oauth"
}

const BasicAuthCredentialsSchema = z.object({
  authMethod: z.literal(MCPServerAuthMethod.BASIC),
  credentials: z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required")
  })
});

const BearerAuthCredentialsSchema = z.object({
  authMethod: z.literal(MCPServerAuthMethod.BEARER),
  credentials: z.object({
    token: z.string().min(1, "Bearer token is required")
  })
});

// OAuth credentials obtained after completing OAuth flow (DCR)
const OAuthCredentialsSchema = z.object({
  authMethod: z.literal(MCPServerAuthMethod.OAUTH),
  credentials: z.object({
    accessToken: z.string().min(1, "Access token is required"),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
    tokenType: z.string().optional()
  })
});

const MCPServerCredentialsSchema = z.discriminatedUnion("authMethod", [
  BasicAuthCredentialsSchema,
  BearerAuthCredentialsSchema,
  OAuthCredentialsSchema
]);

export const AddMCPServerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(64, "Name cannot exceed 64 characters"),
    description: z.string().trim().max(256, "Description cannot exceed 256 characters").optional(),
    url: z.string().trim().min(1, "Endpoint URL is required").url("Must be a valid URL"),
    credentialMode: z.nativeEnum(MCPServerCredentialMode),
    oauthClientId: z.string().trim().optional(),
    oauthClientSecret: z.string().trim().optional(),
    gatewayId: z.string().uuid().optional().nullable()
  })
  .and(MCPServerCredentialsSchema);

export type TAddMCPServerForm = z.infer<typeof AddMCPServerFormSchema>;
