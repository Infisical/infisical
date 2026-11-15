import { format } from "date-fns";

import { CaStatus, CaType, InternalCaType } from "@app/hooks/api/ca/enums";
import { DEFAULT_CRL_VALIDITY_DAYS } from "@app/hooks/api/ca/types";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { CertKeySource } from "@app/hooks/api/signers/types";
import { slugSchema } from "@app/lib/schemas";

import type { CaPlan } from "../../data/certificate-authorities/contract";
import { type CrlUrl, crlUrlErrors, crlValidityIssue, type FieldErrors, firstIssue } from "./crl";

const KEY_SOURCE_ALGORITHMS: Partial<Record<CertKeySource, readonly CertKeyAlgorithm[]>> = {
  [CertKeySource.Hsm]: [
    CertKeyAlgorithm.RSA_2048,
    CertKeyAlgorithm.RSA_4096,
    CertKeyAlgorithm.ECDSA_P256,
    CertKeyAlgorithm.ECDSA_P384,
    CertKeyAlgorithm.ML_DSA_44,
    CertKeyAlgorithm.ML_DSA_65,
    CertKeyAlgorithm.ML_DSA_87
  ],
  [CertKeySource.AwsKms]: [
    CertKeyAlgorithm.RSA_2048,
    CertKeyAlgorithm.RSA_3072,
    CertKeyAlgorithm.RSA_4096,
    CertKeyAlgorithm.ECDSA_P256,
    CertKeyAlgorithm.ECDSA_P384,
    CertKeyAlgorithm.ECDSA_P521,
    CertKeyAlgorithm.ML_DSA_44,
    CertKeyAlgorithm.ML_DSA_65,
    CertKeyAlgorithm.ML_DSA_87
  ]
};

export const supports = (source: CertKeySource, algorithm: CertKeyAlgorithm) =>
  KEY_SOURCE_ALGORITHMS[source]?.includes(algorithm) ?? true;

export const KEY_SOURCE_DESCRIPTIONS: Record<CertKeySource, string> = {
  [CertKeySource.Infisical]: "Infisical generates and manages the CA key pair.",
  [CertKeySource.Hsm]:
    "The key pair is generated on your hardware security module and every signature happens there.",
  [CertKeySource.AwsKms]: "The key pair is generated in AWS KMS and every signature happens there."
};

export const SUBJECT_FIELDS = [
  { key: "commonName", label: "Common name (CN)", placeholder: "Example CA" },
  { key: "organization", label: "Organization (O)", placeholder: "Acme Corp" },
  { key: "ou", label: "Organizational unit (OU)", placeholder: "Engineering" },
  { key: "country", label: "Country (C)", placeholder: "US" },
  { key: "province", label: "State or province (ST)", placeholder: "California" },
  { key: "locality", label: "Locality (L)", placeholder: "San Francisco" }
] as const;

export const PATH_LENGTHS = [-1, 0, 1, 2, 3, 4].map((value) => ({
  value: String(value),
  label: String(value)
}));

const tenYears = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 10);
  return format(date, "yyyy-MM-dd");
};

export const initialDraft = (plan?: CaPlan) => ({
  name: "",
  type: InternalCaType.ROOT,
  commonName: "",
  organization: "",
  ou: "",
  country: "",
  province: "",
  locality: "",
  keySource: CertKeySource.Infisical,
  hsmConnectorId: "",
  appConnectionId: "",
  region: "",
  keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
  notAfter: tenYears(),
  maxPathLength: "-1",
  isOcspEnabled: Boolean(plan?.pkiOcsp),
  disableManagedCrlDistributionPointUrl: false,
  crlDistributionPointUrls: [] as CrlUrl[],
  crlValidityDays: String(DEFAULT_CRL_VALIDITY_DAYS)
});

export type CaDraft = ReturnType<typeof initialDraft>;

const nameSchema = slugSchema({ min: 1, max: 64, field: "Name" });

const required = (missing: boolean, message: string) => (missing ? message : undefined);

export const validateBasics = (draft: CaDraft): FieldErrors => ({
  name: firstIssue(nameSchema, draft.name)
});

export const validateSubject = (draft: CaDraft): FieldErrors => ({
  commonName: required(
    !SUBJECT_FIELDS.some(({ key }) => draft[key].trim()),
    "Set at least one subject field, such as the common name."
  )
});

export const validateKey = (draft: CaDraft): FieldErrors => {
  const hsm = draft.keySource === CertKeySource.Hsm;
  const kms = draft.keySource === CertKeySource.AwsKms;
  return {
    hsmConnectorId: required(hsm && !draft.hsmConnectorId, "Pick an HSM connector"),
    appConnectionId: required(kms && !draft.appConnectionId, "Pick an AWS connection"),
    region: required(kms && !draft.region, "Pick an AWS region"),
    keyAlgorithm: required(
      !supports(draft.keySource, draft.keyAlgorithm),
      "The selected key source doesn't support this algorithm"
    ),
    notAfter: required(
      draft.type === InternalCaType.ROOT && Number.isNaN(new Date(draft.notAfter).getTime()),
      "Enter a valid expiry date"
    )
  };
};

export const validateDistribution = (draft: CaDraft): FieldErrors => ({
  crlValidityDays: crlValidityIssue(draft.crlValidityDays),
  ...crlUrlErrors(draft.crlDistributionPointUrls)
});

const keyLocation = (draft: CaDraft) => {
  if (draft.keySource === CertKeySource.Hsm) return { hsmConnectorId: draft.hsmConnectorId };
  if (draft.keySource === CertKeySource.AwsKms)
    return { appConnectionId: draft.appConnectionId, region: draft.region };
  return {};
};

export const toCreateCaDto = (draft: CaDraft) => ({
  name: draft.name,
  type: CaType.INTERNAL,
  status: CaStatus.ACTIVE,
  configuration: {
    type: draft.type,
    commonName: draft.commonName.trim(),
    organization: draft.organization.trim(),
    ou: draft.ou.trim(),
    country: draft.country.trim(),
    province: draft.province.trim(),
    locality: draft.locality.trim(),
    keyAlgorithm: draft.keyAlgorithm,
    keySource: draft.keySource,
    ...keyLocation(draft),
    maxPathLength: Number(draft.maxPathLength),
    ...(draft.type === InternalCaType.ROOT && { notAfter: draft.notAfter }),
    crlDistributionPointUrls: draft.crlDistributionPointUrls.map((url) => url.value.trim()),
    disableManagedCrlDistributionPointUrl: draft.disableManagedCrlDistributionPointUrl,
    isOcspEnabled: draft.isOcspEnabled,
    crlValidityDays: Number(draft.crlValidityDays)
  }
});
