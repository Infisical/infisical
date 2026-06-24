import { z } from "zod";

import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { F5BigIpProfileType } from "@app/hooks/api/pkiSyncs/types/f5-big-ip-sync";

import { BasePkiSyncSchema } from "./base-pki-sync-schema";

const F5_BIG_IP_OBJECT_NAME_REGEX = /^[a-zA-Z0-9._-]{1,255}$/;

const F5BigIpSyncOptionsSchema = z.object({
  canRemoveCertificates: z.boolean().default(true),
  includeRootCa: z.boolean().default(false),
  preserveItemOnRenewal: z.boolean().default(true),
  certificateNameSchema: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;

        const allowedOptionalPlaceholders = [
          "{{profileId}}",
          "{{applicationId}}",
          "{{commonName}}"
        ];

        const allowedPlaceholdersRegexPart = ["{{certificateId}}", ...allowedOptionalPlaceholders]
          .map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
          .join("|");

        const allowedContentRegex = new RegExp(
          `^([a-zA-Z0-9_\\-.]|${allowedPlaceholdersRegexPart})*$`
        );
        const contentIsValid = allowedContentRegex.test(val);

        if (val.trim()) {
          const certificateIdRegex = /\{\{certificateId\}\}/;
          const certificateIdIsPresent = certificateIdRegex.test(val);
          return contentIsValid && certificateIdIsPresent;
        }

        return contentIsValid;
      },
      {
        message:
          "Certificate name schema must include the {{certificateId}} placeholder. It can also include {{profileId}}, {{applicationId}}, and {{commonName}} placeholders. Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and periods (.) are allowed besides the placeholders."
      }
    )
});

const hasProfileBinding = (profileType: F5BigIpProfileType | undefined) =>
  profileType !== undefined && profileType !== F5BigIpProfileType.None;

const F5BigIpDestinationConfigSchema = z
  .object({
    partition: z
      .string()
      .trim()
      .min(1, "Partition cannot be empty")
      .max(255, "Partition cannot exceed 255 characters")
      .regex(
        F5_BIG_IP_OBJECT_NAME_REGEX,
        "Partition must contain only alphanumeric characters, hyphens, underscores, and periods"
      )
      .optional(),
    profileType: z.nativeEnum(F5BigIpProfileType).optional(),
    profileName: z
      .union([
        z
          .string()
          .trim()
          .max(255, "Profile name cannot exceed 255 characters")
          .regex(
            F5_BIG_IP_OBJECT_NAME_REGEX,
            "Profile name must contain only alphanumeric characters, hyphens, underscores, and periods"
          ),
        z.literal("")
      ])
      .optional()
      .transform((value) => value || undefined),
    createProfileIfMissing: z.boolean().optional(),
    parentProfile: z
      .union([
        z.string().trim().max(511, "Parent profile cannot exceed 511 characters"),
        z.literal("")
      ])
      .optional()
      .transform((value) => value || undefined)
  })
  .transform((value) =>
    hasProfileBinding(value.profileType)
      ? value
      : {
          ...value,
          profileName: undefined,
          createProfileIfMissing: false,
          parentProfile: undefined
        }
  )
  .transform((value) =>
    value.createProfileIfMissing ? value : { ...value, parentProfile: undefined }
  )
  .refine((value) => !hasProfileBinding(value.profileType) || Boolean(value.profileName), {
    message: "Profile name is required when a profile type is selected",
    path: ["profileName"]
  });

export const F5BigIpPkiSyncDestinationSchema = BasePkiSyncSchema(F5BigIpSyncOptionsSchema).merge(
  z.object({
    destination: z.literal(PkiSync.F5BigIp),
    destinationConfig: F5BigIpDestinationConfigSchema
  })
);

export const UpdateF5BigIpPkiSyncDestinationSchema =
  F5BigIpPkiSyncDestinationSchema.partial().merge(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, "Name is required")
        .max(255, "Name must be less than 255 characters"),
      destination: z.literal(PkiSync.F5BigIp),
      connection: z.object({
        id: z.string().uuid("Invalid connection ID format"),
        name: z
          .string()
          .min(1, "Connection name is required")
          .max(255, "Connection name must be less than 255 characters")
      })
    })
  );
