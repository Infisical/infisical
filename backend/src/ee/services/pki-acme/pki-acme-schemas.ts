import { z } from "zod";

export enum AcmeIdentifierType {
  DNS = "dns"
}

export enum AcmeOrderStatus {
  Pending = "pending",
  Processing = "processing",
  Ready = "ready",
  Valid = "valid",
  Invalid = "invalid"
}

export enum AcmeAuthStatus {
  Pending = "pending",
  Valid = "valid",
  Invalid = "invalid",
  Deactivated = "deactivated",
  Expired = "expired",
  Revoked = "revoked"
}

export enum AcmeChallengeType {
  HTTP_01 = "http-01",
  DNS_01 = "dns-01",
  TLS_ALPN_01 = "tls-alpn-01"
}

export const ProtectedHeaderSchema = z
  .object({
    alg: z.string(),
    nonce: z.string(),
    url: z.string(),
    kid: z.string().optional(),
    jwk: z.record(z.string(), z.string()).optional()
  })
  .refine((data) => data.kid || data.jwk, {
    message: "Either kid or jwk must be provided",
    path: ["kid", "jwk"]
  });

// Raw JWS payload schema before parsing and verification
export const RawJwsPayloadSchema = z.object({
  protected: z.string(),
  payload: z.string(),
  signature: z.string()
});

export const GetAcmeDirectoryResponseSchema = z.object({
  newNonce: z.string(),
  newAccount: z.string(),
  newOrder: z.string(),
  revokeCert: z.string().optional()
});

// New Account payload schema
export const CreateAcmeAccountBodySchema = z.object({
  contact: z.array(z.string()).optional(),
  termsOfServiceAgreed: z.boolean().optional(),
  onlyReturnExisting: z.boolean().optional(),
  externalAccountBinding: z
    .object({
      protected: z.string(),
      payload: z.string(),
      signature: z.string()
    })
    .optional()
});

// New Account endpoint
export const CreateAcmeAccountSchema = z.object({
  params: z.object({
    profileId: z.string().uuid()
  }),
  body: CreateAcmeAccountBodySchema
});

export const CreateAcmeAccountResponseSchema = z.object({
  status: z.string(),
  contact: z.array(z.string()).optional(),
  orders: z.string().optional()
});

// New Order payload schema
export const CreateAcmeOrderBodySchema = z.object({
  identifiers: z.array(
    z.object({
      type: z.enum(Object.values(AcmeIdentifierType) as [string, ...string[]]),
      value: z
        .string()
        .regex(/^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/, "Invalid DNS identifier")
    })
  ),
  notBefore: z.string().optional(),
  notAfter: z.string().optional()
});

export const AcmeOrderResourceSchema = z.object({
  status: z.enum(Object.values(AcmeOrderStatus) as [string, ...string[]]),
  expires: z.string().optional(),
  notBefore: z.string().optional(),
  notAfter: z.string().optional(),
  identifiers: z.array(
    z.object({
      type: z.string(),
      value: z.string()
    })
  ),
  authorizations: z.array(z.string()),
  finalize: z.string(),
  certificate: z.string().optional()
});

// Account Deactivation payload schema
export const DeactivateAcmeAccountBodySchema = z.object({
  status: z.literal("deactivated")
});

export const DeactivateAcmeAccountResponseSchema = z.object({
  status: z.string()
});

// List Orders endpoint
export const ListAcmeOrdersPayloadSchema = z.object({}).strict();

export const ListAcmeOrdersResponseSchema = z.object({
  orders: z.array(z.string())
});

// Finalize Order payload schema
export const FinalizeAcmeOrderBodySchema = z.object({
  csr: z.string()
});

export const GetAcmeAuthorizationResponseSchema = z.object({
  status: z.enum(Object.values(AcmeAuthStatus) as [string, ...string[]]),
  expires: z.string().optional(),
  identifier: z.object({
    type: z.string(),
    value: z.string()
  }),
  challenges: z.array(
    z.object({
      type: z.enum(Object.values(AcmeChallengeType) as [string, ...string[]]),
      url: z.string(),
      status: z.string(),
      token: z.string(),
      validated: z.string().optional()
    })
  )
});

export const RespondToAcmeChallengeResponseSchema = z.object({
  type: z.enum(Object.values(AcmeChallengeType) as [string, ...string[]]),
  url: z.string(),
  status: z.string(),
  token: z.string(),
  validated: z.string().optional(),
  error: z
    .object({
      type: z.string(),
      detail: z.string(),
      status: z.number()
    })
    .optional()
});
