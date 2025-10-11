import RE2 from "re2";
import { z } from "zod";

import { EnrollmentType } from "./certificate-profile-types";

export const createCertificateProfileSchema = z
  .object({
    projectId: z.string().min(1),
    caId: z.string().uuid(),
    certificateTemplateId: z.string().uuid(),
    slug: z
      .string()
      .min(1)
      .max(255)
      .regex(new RE2("^[a-z0-9-]+$"), "Slug must contain only lowercase letters, numbers, and hyphens"),
    description: z.string().max(1000).optional(),
    enrollmentType: z.nativeEnum(EnrollmentType),
    estConfig: z
      .object({
        disableBootstrapCaValidation: z.boolean().default(false),
        passphrase: z.string().min(1),
        encryptedCaChain: z.string()
      })
      .optional(),
    apiConfig: z
      .object({
        autoRenew: z.boolean().default(false),
        autoRenewDays: z.number().min(1).max(365).optional()
      })
      .optional()
  })
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST && !data.estConfig) {
        return false;
      }
      if (data.enrollmentType === EnrollmentType.API && !data.apiConfig) {
        return false;
      }
      return true;
    },
    {
      message: "Config must be provided based on enrollment type"
    }
  );

export const updateCertificateProfileSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(new RE2("^[a-z0-9-]+$"), "Slug must contain only lowercase letters, numbers, and hyphens")
    .optional(),
  description: z.string().max(1000).optional(),
  enrollmentType: z.nativeEnum(EnrollmentType).optional(),
  estConfig: z
    .object({
      disableBootstrapCaValidation: z.boolean().default(false),
      passphrase: z.string().min(1),
      encryptedCaChain: z.string()
    })
    .optional(),
  apiConfig: z
    .object({
      autoRenew: z.boolean().default(false),
      autoRenewDays: z.number().min(1).max(365).optional()
    })
    .optional()
});

export const getCertificateProfileByIdSchema = z.object({
  id: z.string().uuid()
});

export const getCertificateProfileBySlugSchema = z.object({
  projectId: z.string().min(1),
  slug: z.string().min(1)
});

export const listCertificateProfilesSchema = z.object({
  projectId: z.string().min(1),
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  enrollmentType: z.nativeEnum(EnrollmentType).optional(),
  caId: z.string().uuid().optional()
});

export const deleteCertificateProfileSchema = z.object({
  id: z.string().uuid()
});

export const listCertificatesByProfileSchema = z.object({
  profileId: z.string().uuid(),
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(["active", "expired", "revoked"]).optional(),
  search: z.string().optional()
});

export const getCertificateProfileMetricsSchema = z.object({
  profileId: z.string().uuid(),
  expiringDays: z.coerce.number().min(1).max(365).default(30)
});
