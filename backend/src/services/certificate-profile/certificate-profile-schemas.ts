import RE2 from "re2";
import { z } from "zod";

import { CertStatus } from "../certificate/certificate-types";
import { EnrollmentType, IssuerType } from "./certificate-profile-types";

export const createCertificateProfileSchema = z
  .object({
    projectId: z.string().uuid("Project ID must be valid"),
    caId: z
      .union([z.string().uuid(), z.literal("")])
      .optional()
      .nullable()
      .transform((val) => (val === "" ? null : val)),
    certificateTemplateId: z.string().uuid(),
    slug: z
      .string()
      .min(1)
      .max(255)
      .regex(new RE2("^[a-z0-9-]+$"), "Slug must contain only lowercase letters, numbers, and hyphens"),
    description: z.string().max(1000).optional(),
    enrollmentType: z.nativeEnum(EnrollmentType),
    issuerType: z.nativeEnum(IssuerType).default(IssuerType.CA),
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
      // Validate enrollment type configurations
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

      if (data.issuerType === IssuerType.CA) {
        if (!data.caId) {
          return false;
        }
      }
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        if (data.caId) {
          return false;
        }
        if (data.enrollmentType !== EnrollmentType.API) {
          return false;
        }
      }

      return true;
    },
    {
      message:
        "EST enrollment type requires EST configuration and cannot have API configuration. API enrollment type requires API configuration and cannot have EST configuration. CA issuer type requires a CA ID. Self-signed issuer type cannot have a CA ID and only supports API enrollment."
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
    issuerType: z.nativeEnum(IssuerType).optional(),
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

      if (data.issuerType === IssuerType.SELF_SIGNED) {
        if (data.enrollmentType && data.enrollmentType !== EnrollmentType.API) {
          return false;
        }
      }

      return true;
    },
    {
      message:
        "Cannot have EST config with API enrollment type or API config with EST enrollment type. Self-signed issuer type only supports API enrollment."
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
  issuerType: z.nativeEnum(IssuerType).optional(),
  caId: z.string().uuid().optional()
});

export const deleteCertificateProfileSchema = z.object({
  id: z.string().uuid()
});

export const listCertificatesByProfileSchema = z.object({
  profileId: z.string().uuid(),
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.nativeEnum(CertStatus).optional(),
  search: z.string().optional()
});
