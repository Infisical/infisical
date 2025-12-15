import RE2 from "re2";
import { z } from "zod";

import { CertStatus } from "../certificate/certificate-types";
import { EnrollmentType, IssuerType } from "./certificate-profile-types";

export const createCertificateProfileSchema = z
  .object({
    projectId: z.string().uuid("Project ID must be valid"),
    caId: z.string().uuid().nullable().optional(),
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
    acmeConfig: z
      .object({
        skipDnsOwnershipVerification: z.boolean().optional()
      })
      .optional()
  })
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        return !!data.estConfig;
      }
      return true;
    },
    {
      message: "EST enrollment type requires EST configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.API) {
        return !!data.apiConfig;
      }
      return true;
    },
    {
      message: "API enrollment type requires API configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME) {
        return !!data.acmeConfig;
      }
      return true;
    },
    {
      message: "ACME enrollment type requires ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        return !data.apiConfig && !data.acmeConfig;
      }
      return true;
    },
    {
      message: "EST enrollment type cannot have API or ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.API) {
        return !data.estConfig && !data.acmeConfig;
      }
      return true;
    },
    {
      message: "API enrollment type cannot have EST or ACME configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.ACME) {
        return !data.estConfig && !data.apiConfig;
      }
      return true;
    },
    {
      message: "ACME enrollment type cannot have EST or API configuration"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.CA) {
        return !!data.caId;
      }
      return true;
    },
    {
      message: "CA issuer type requires a CA ID"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        return !data.caId;
      }
      return true;
    },
    {
      message: "Self-signed issuer type cannot have a CA ID"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        return data.enrollmentType === EnrollmentType.API;
      }
      return true;
    },
    {
      message: "Self-signed issuer type only supports API enrollment"
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
      .optional(),
    acmeConfig: z
      .object({
        skipDnsOwnershipVerification: z.boolean().optional()
      })
      .optional()
  })
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.EST) {
        return !data.apiConfig;
      }
      return true;
    },
    {
      message: "EST enrollment type cannot have API configuration"
    }
  )
  .refine(
    (data) => {
      if (data.enrollmentType === EnrollmentType.API) {
        return !data.estConfig;
      }
      return true;
    },
    {
      message: "API enrollment type cannot have EST configuration"
    }
  )
  .refine(
    (data) => {
      if (data.issuerType === IssuerType.SELF_SIGNED) {
        return !data.enrollmentType || data.enrollmentType === EnrollmentType.API;
      }
      return true;
    },
    {
      message: "Self-signed issuer type only supports API enrollment"
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
