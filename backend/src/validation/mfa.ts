import { z } from "zod";

import { validateMfaAuthAppTotp, validateMfaPreference } from "./helpers";

export const EnableMfaAuthAppStep2V3 = z.object({
  body: z.object({
    userTotp: validateMfaAuthAppTotp,
  }),
});

export const UpdateMfaPreferenceV3 = z.object({
  body: z.object({
    mfaPreference: validateMfaPreference,
  })
});
