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
