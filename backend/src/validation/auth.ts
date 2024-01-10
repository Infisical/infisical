import { z } from "zod";

export const BeginEmailSignUpV1 = z.object({
  body: z.object({
    email: z.string().email().trim()
  })
});

export const VerifyEmailSignUpV1 = z.object({
  body: z.object({
    email: z.string().email().trim(),
    code: z.string().trim()
  })
});

export const Login1V1 = z.object({
  body: z.object({
    email: z.string().email().trim(),
    clientPublicKey: z.string().trim()
  })
});

export const Login2V1 = z.object({
  body: z.object({
    email: z.string().email().trim(),
    clientProof: z.string().trim()
  })
});

export const Srp1V1 = z.object({
  body: z.object({
    clientPublicKey: z.string().trim()
  })
});

export const ChangePasswordV1 = z.object({
  body: z.object({
    clientProof: z.string().trim(),
    protectedKey: z.string().trim(),
    protectedKeyIV: z.string().trim(),
    protectedKeyTag: z.string().trim(),
    encryptedPrivateKey: z.string().trim(),
    encryptedPrivateKeyIV: z.string().trim(),
    encryptedPrivateKeyTag: z.string().trim(),
    salt: z.string().trim(),
    verifier: z.string().trim()
  })
});

export const EmailPasswordResetV1 = z.object({
  body: z.object({
    email: z.string().email().trim()
  })
});

export const EmailPasswordResetVerifyV1 = z.object({
  body: z.object({
    email: z.string().email().trim(),
    code: z.string().trim()
  })
});

export const CreateBackupPrivateKeyV1 = z.object({
  body: z.object({
    clientProof: z.string().trim(),
    encryptedPrivateKey: z.string().trim(),
    iv: z.string().trim(),
    tag: z.string().trim(),
    salt: z.string().trim(),
    verifier: z.string().trim()
  })
});

export const ResetPasswordV1 = z.object({
  body: z.object({
    protectedKey: z.string().trim(),
    protectedKeyIV: z.string().trim(),
    protectedKeyTag: z.string().trim(),
    encryptedPrivateKey: z.string().trim(),
    encryptedPrivateKeyIV: z.string().trim(),
    encryptedPrivateKeyTag: z.string().trim(),
    salt: z.string().trim(),
    verifier: z.string().trim()
  })
});

export const RenewAccessTokenV1 = z.object({
  body: z.object({
    accessToken: z.string().trim(),
  })
});

export const LoginUniversalAuthV1 = z.object({
  body: z.object({
    clientId: z.string().trim(),
    clientSecret: z.string().trim()
  })
});

export const AddUniversalAuthToIdentityV1 = z.object({
  params: z.object({
    identityId: z.string().trim()
  }),
  body: z.object({
    clientSecretTrustedIps: z
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]),
    accessTokenTrustedIps: z
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]),
    accessTokenTTL: z.number().int().min(1).refine(value => value !== 0, {
      message: "accessTokenTTL must have a non zero number",
    }).default(2592000),
    accessTokenMaxTTL: z.number().int().refine(value => value !== 0, {
      message: "accessTokenMaxTTL must have a non zero number",
    }).default(2592000), // 30 days
    accessTokenNumUsesLimit: z.number().int().min(0).default(0)
  })
});

export const UpdateUniversalAuthToIdentityV1 = z.object({
  params: z.object({
    identityId: z.string()
  }),
  body: z.object({
    clientSecretTrustedIps: z
      .object({
        ipAddress: z.string().trim()
      })
      .array()
      .min(1)
      .optional(),
    accessTokenTrustedIps: z
      .object({
        ipAddress: z.string().trim(),
      })
      .array()
      .min(1)
      .optional(),
    accessTokenTTL: z.number().int().min(0).optional(),
    accessTokenNumUsesLimit: z.number().int().min(0).optional(),
    accessTokenMaxTTL: z.number().int().refine(value => value !== 0, {
      message: "accessTokenMaxTTL must have a non zero number",
    }).optional(),
  }),
});

export const GetUniversalAuthForIdentityV1 = z.object({
  params: z.object({
    identityId: z.string().trim()
  })
});

export const CreateUniversalAuthClientSecretV1 = z.object({
  params: z.object({
    identityId: z.string()
  }),
  body: z.object({
    description: z.string().trim().default(""),
    numUsesLimit: z.number().min(0).default(0),
    ttl: z.number().min(0).default(0),
  }),
});

export const GetUniversalAuthClientSecretsV1 = z.object({
  params: z.object({
    identityId: z.string()
  })
});

export const RevokeUniversalAuthClientSecretV1 = z.object({
  params: z.object({
    identityId: z.string(),
    clientSecretId: z.string()
  })
});

export const VerifyMfaTokenV2 = z.object({
  body: z.object({
    mfaToken: z.string().trim()
  })
});

export const Login1V3 = z.object({
  body: z.object({
    email: z.string().email().trim(),
    providerAuthToken: z.string().trim().optional(),
    clientPublicKey: z.string().trim()
  })
});

export const Login2V3 = z.object({
  body: z.object({
    email: z.string().email().trim(),
    providerAuthToken: z.string().trim().optional(),
    clientProof: z.string().trim()
  })
});

export const CompletedAccountSignupV3 = z.object({
  body: z.object({
    email: z.string().email().trim(),
    firstName: z.string().trim(),
    lastName: z.string().trim().optional(),
    protectedKey: z.string().trim(),
    protectedKeyIV: z.string().trim(),
    protectedKeyTag: z.string().trim(),
    publicKey: z.string().trim(),
    encryptedPrivateKey: z.string().trim(),
    encryptedPrivateKeyIV: z.string().trim(),
    encryptedPrivateKeyTag: z.string().trim(),
    salt: z.string().trim(),
    verifier: z.string().trim(),
    organizationName: z.string().trim(),
    providerAuthToken: z.string().trim().optional().nullish(),
    attributionSource: z.string().trim().optional()
  })
});
