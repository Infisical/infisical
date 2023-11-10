import { z } from "zod";

export const UpdateServerConfigV1 = z.object({
  body: z.object({
    allowSignUp: z.boolean().optional()
  })
});

export const SignupV1 = z.object({
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
    verifier: z.string().trim()
  })
});
