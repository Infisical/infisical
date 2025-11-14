import RE2 from "re2";
import { z } from "zod";

import { EnrollmentType } from "./certificate-profile-types";

export const createCertificateProfileSchema = z
  .object({
    projectId: z.string().uuid("Project ID must be valid"),
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
        renewBeforeDays: z.number().min(1).max(30).optional()
      })
      .optional(),
    acmeConfig: z.object({}).optional()
  })
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        if (!data.estConfig) {
          return false;
        }
        if (data.apiConfig) {
          return false;
        }
        if (data.acmeConfig) {
          return false;
        }
      }
      if (data.enrollmentType === EnrollmentType.API) {
        if (!data.apiConfig) {
          return false;
        }
        if (data.estConfig) {
          return false;
        }
        if (data.acmeConfig) {
          return false;
        }
      }
      if (data.enrollmentType === EnrollmentType.ACME) {
        if (!data.acmeConfig) {
          return false;
        }
        if (data.estConfig) {
          return false;
        }
        if (data.apiConfig) {
          return false;
        }
      }
      return true;
    },
    {
      message:
        "EST enrollment type requires EST configuration and cannot have API configuration. API enrollment type requires API configuration and cannot have EST configuration."
    }
  );

export const updateCertificateProfileSchema = z
  .object({
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
        renewBeforeDays: z.number().min(1).max(30).optional()
      })
      .optional()
  })
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        if (data.apiConfig) {
          return false;
        }
      }
      if (data.enrollmentType === EnrollmentType.API) {
        if (data.estConfig) {
          return false;
        }
      }
      return true;
    },
    {
      message: "Cannot have EST config with API enrollment type or API config with EST enrollment type."
    }
  );

export const getCertificateProfileByIdSchema = z.object({
  id: z.string().uuid()
});

export const getCertificateProfileBySlugSchema = z.object({
  projectId: z.string().uuid("Project ID must be valid"),
  slug: z.string().min(1)
});

export const listCertificateProfilesSchema = z.object({
  projectId: z.string().uuid("Project ID must be valid"),
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
