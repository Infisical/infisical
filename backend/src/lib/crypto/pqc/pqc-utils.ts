import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

// OIDs per RFC 9881
const ML_DSA_44_OID = "2.16.840.1.101.3.4.3.17";
const ML_DSA_65_OID = "2.16.840.1.101.3.4.3.18";
const ML_DSA_87_OID = "2.16.840.1.101.3.4.3.19";
const SLH_DSA_SHA2_128S_OID = "2.16.840.1.101.3.4.3.20";
const SLH_DSA_SHA2_128F_OID = "2.16.840.1.101.3.4.3.21";
const SLH_DSA_SHA2_192S_OID = "2.16.840.1.101.3.4.3.22";
const SLH_DSA_SHA2_192F_OID = "2.16.840.1.101.3.4.3.23";
const SLH_DSA_SHA2_256S_OID = "2.16.840.1.101.3.4.3.24";
const SLH_DSA_SHA2_256F_OID = "2.16.840.1.101.3.4.3.25";
const SLH_DSA_SHAKE_128S_OID = "2.16.840.1.101.3.4.3.26";
const SLH_DSA_SHAKE_128F_OID = "2.16.840.1.101.3.4.3.27";
const SLH_DSA_SHAKE_192S_OID = "2.16.840.1.101.3.4.3.28";
const SLH_DSA_SHAKE_192F_OID = "2.16.840.1.101.3.4.3.29";
const SLH_DSA_SHAKE_256S_OID = "2.16.840.1.101.3.4.3.30";
const SLH_DSA_SHAKE_256F_OID = "2.16.840.1.101.3.4.3.31";

const PQC_ALGORITHMS = new Set([
  CertKeyAlgorithm.ML_DSA_44,
  CertKeyAlgorithm.ML_DSA_65,
  CertKeyAlgorithm.ML_DSA_87,
  CertKeyAlgorithm.SLH_DSA_SHA2_128F,
  CertKeyAlgorithm.SLH_DSA_SHA2_128S,
  CertKeyAlgorithm.SLH_DSA_SHA2_192F,
  CertKeyAlgorithm.SLH_DSA_SHA2_192S,
  CertKeyAlgorithm.SLH_DSA_SHA2_256F,
  CertKeyAlgorithm.SLH_DSA_SHA2_256S,
  CertKeyAlgorithm.SLH_DSA_SHAKE_128F,
  CertKeyAlgorithm.SLH_DSA_SHAKE_128S,
  CertKeyAlgorithm.SLH_DSA_SHAKE_192F,
  CertKeyAlgorithm.SLH_DSA_SHAKE_192S,
  CertKeyAlgorithm.SLH_DSA_SHAKE_256F,
  CertKeyAlgorithm.SLH_DSA_SHAKE_256S
]);

export const isPqcAlgorithm = (keyAlgorithm: string): boolean => {
  return PQC_ALGORITHMS.has(keyAlgorithm as CertKeyAlgorithm);
};

const OID_TO_NAME: Record<string, string> = {
  [ML_DSA_44_OID]: CertKeyAlgorithm.ML_DSA_44,
  [ML_DSA_65_OID]: CertKeyAlgorithm.ML_DSA_65,
  [ML_DSA_87_OID]: CertKeyAlgorithm.ML_DSA_87,
  [SLH_DSA_SHA2_128S_OID]: CertKeyAlgorithm.SLH_DSA_SHA2_128S,
  [SLH_DSA_SHA2_128F_OID]: CertKeyAlgorithm.SLH_DSA_SHA2_128F,
  [SLH_DSA_SHA2_192S_OID]: CertKeyAlgorithm.SLH_DSA_SHA2_192S,
  [SLH_DSA_SHA2_192F_OID]: CertKeyAlgorithm.SLH_DSA_SHA2_192F,
  [SLH_DSA_SHA2_256S_OID]: CertKeyAlgorithm.SLH_DSA_SHA2_256S,
  [SLH_DSA_SHA2_256F_OID]: CertKeyAlgorithm.SLH_DSA_SHA2_256F,
  [SLH_DSA_SHAKE_128S_OID]: CertKeyAlgorithm.SLH_DSA_SHAKE_128S,
  [SLH_DSA_SHAKE_128F_OID]: CertKeyAlgorithm.SLH_DSA_SHAKE_128F,
  [SLH_DSA_SHAKE_192S_OID]: CertKeyAlgorithm.SLH_DSA_SHAKE_192S,
  [SLH_DSA_SHAKE_192F_OID]: CertKeyAlgorithm.SLH_DSA_SHAKE_192F,
  [SLH_DSA_SHAKE_256S_OID]: CertKeyAlgorithm.SLH_DSA_SHAKE_256S,
  [SLH_DSA_SHAKE_256F_OID]: CertKeyAlgorithm.SLH_DSA_SHAKE_256F
};

const NAME_TO_OID: Record<string, string> = Object.fromEntries(Object.entries(OID_TO_NAME).map(([k, v]) => [v, k]));

export const pqcOidToName = (oid: string): string | null => OID_TO_NAME[oid] || null;
export const pqcNameToOid = (name: string): string | null => NAME_TO_OID[name] || null;
