import { z } from "zod";

import { CertificateAuthorities } from "@app/lib/api-docs/constants";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import {
  PKI_TEXT_COLUMN_MAX_LENGTH,
  subjectAttributeSchema
} from "@app/services/certificate-common/certificate-constants";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CertKeySource } from "@app/services/signer/signer-enums";

import { CaStatus, CaType, InternalCaType } from "../certificate-authority-enums";
import {
  BaseCertificateAuthoritySchema,
  GenericCreateCertificateAuthorityFieldsSchema,
  GenericUpdateCertificateAuthorityFieldsSchema
} from "../certificate-authority-schemas";
import { distributionPointUrlsSchema, validateCaDateField } from "../certificate-authority-validators";

type TInternalCertificateAuthorityConfiguration = {
  type: InternalCaType;
  friendlyName?: string;
  commonName: string;
  organization: string;
  ou: string;
  country: string;
  province: string;
  locality: string;
  notBefore?: string;
  notAfter?: string;
  maxPathLength?: number | null;
  keyAlgorithm: CertKeyAlgorithm;
  keySource?: CertKeySource;
  hsmConnectorId?: string;
  hsmKeyLabel?: string;
  appConnectionId?: string;
  appConnectionName?: string;
  hsmConnectorName?: string;
  region?: AWSRegion;
  externalKeyId?: string;
  dn?: string | null;
  parentCaId?: string | null;
  serialNumber?: string | null;
  activeCaCertId?: string | null;
  crlDistributionPointUrls?: string[];
  disableManagedCrlDistributionPointUrl?: boolean;
  isOcspEnabled?: boolean;
};

export const InternalCertificateAuthorityConfigurationSchema = z
  .object({
    type: z.nativeEnum(InternalCaType).describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.type),
    friendlyName: z
      .string()
      .trim()
      .max(PKI_TEXT_COLUMN_MAX_LENGTH)
      .optional()
      .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.friendlyName),
    commonName: subjectAttributeSchema.default("").describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.commonName),
    organization: subjectAttributeSchema
      .default("")
      .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.organization),
    ou: subjectAttributeSchema.default("").describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.ou),
    country: subjectAttributeSchema.default("").describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.country),
    province: subjectAttributeSchema.default("").describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.province),
    locality: subjectAttributeSchema.default("").describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.locality),
    notBefore: validateCaDateField.optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.notBefore),
    notAfter: validateCaDateField.optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.notAfter),
    maxPathLength: z.number().min(-1).nullish().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.maxPathLength),
    keyAlgorithm: z.nativeEnum(CertKeyAlgorithm).describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.keyAlgorithm),
    keySource: z
      .nativeEnum(CertKeySource)
      .optional()
      .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.keySource),
    hsmConnectorId: z
      .string()
      .uuid()
      .optional()
      .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.hsmConnectorId),
    hsmKeyLabel: z
      .string()
      .optional()
      .describe(
        JSON.stringify({ deprecated: true, description: CertificateAuthorities.CONFIGURATIONS.INTERNAL.hsmKeyLabel })
      ),
    appConnectionId: z
      .string()
      .uuid()
      .optional()
      .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.appConnectionId),
    appConnectionName: z.string().optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.appConnectionName),
    hsmConnectorName: z.string().optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.hsmConnectorName),
    region: z.nativeEnum(AWSRegion).optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.region),
    externalKeyId: z.string().optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.externalKeyId),
    dn: z.string().trim().max(PKI_TEXT_COLUMN_MAX_LENGTH).nullish(),
    parentCaId: z.string().uuid().nullish(),
    serialNumber: z.string().trim().nullish(),
    activeCaCertId: z.string().uuid().nullish(),
    crlDistributionPointUrls: distributionPointUrlsSchema
      .optional()
      .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.crlDistributionPointUrls),
    disableManagedCrlDistributionPointUrl: z
      .boolean()
      .optional()
      .default(false)
      .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.disableManagedCrlDistributionPointUrl),
    isOcspEnabled: z.boolean().optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.isOcspEnabled)
  })
  .refine(
    (data) => {
      // Check that at least one of the specified fields is non-empty
      return [data.commonName, data.organization, data.ou, data.country, data.province, data.locality].some(
        (field) => field !== ""
      );
    },
    {
      message:
        "At least one of the fields commonName, organization, ou, country, province, or locality must be non-empty",
      path: []
    }
  )
  .refine((data) => data.keySource === CertKeySource.AwsKms || (!data.appConnectionId && !data.region), {
    message: "appConnectionId and region can only be set when keySource is 'aws-kms'",
    path: ["keySource"]
  })
  .refine((data) => data.keySource !== CertKeySource.AwsKms || !data.hsmConnectorId, {
    message: "hsmConnectorId cannot be set when keySource is 'aws-kms'",
    path: ["keySource"]
  }) as unknown as z.ZodType<TInternalCertificateAuthorityConfiguration>;

export const InternalCertificateAuthoritySchema = BaseCertificateAuthoritySchema.extend({
  type: z.literal(CaType.INTERNAL),
  configuration: InternalCertificateAuthorityConfigurationSchema
});

export const CreateInternalCertificateAuthoritySchema = GenericCreateCertificateAuthorityFieldsSchema(CaType.INTERNAL)
  .extend({
    configuration: InternalCertificateAuthorityConfigurationSchema
  })
  .refine(
    ({ configuration }) =>
      !configuration.externalKeyId && !configuration.appConnectionName && !configuration.hsmConnectorName,
    {
      message:
        "externalKeyId, appConnectionName and hsmConnectorName are read-only and cannot be set when creating a certificate authority",
      path: ["configuration"]
    }
  );

export const UpdateInternalCertificateAuthorityConfigurationSchema = z.object({
  crlDistributionPointUrls: distributionPointUrlsSchema
    .optional()
    .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.crlDistributionPointUrls),
  disableManagedCrlDistributionPointUrl: z
    .boolean()
    .optional()
    .describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.disableManagedCrlDistributionPointUrl),
  isOcspEnabled: z.boolean().optional().describe(CertificateAuthorities.CONFIGURATIONS.INTERNAL.isOcspEnabled)
});

export const UpdateInternalCertificateAuthoritySchema = GenericUpdateCertificateAuthorityFieldsSchema(
  CaType.INTERNAL
).extend({
  configuration: UpdateInternalCertificateAuthorityConfigurationSchema.optional()
}) as unknown as z.ZodType<{
  status?: CaStatus;
  configuration?: TInternalCertificateAuthorityConfiguration;
}>;
