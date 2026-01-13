import * as x509 from "@peculiar/x509";

import { BadRequestError } from "@app/lib/errors";

import {
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSignatureAlgorithm,
  mapLegacyAltNameType,
  TAltNameMapping,
  TAltNameType
} from "../certificate/certificate-types";
import { parseDistinguishedName } from "../certificate-authority/certificate-authority-fns";
import { validateAndMapAltNameType } from "../certificate-authority/certificate-authority-validators";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import { mapLegacyExtendedKeyUsageToStandard, mapLegacyKeyUsageToStandard } from "./certificate-constants";

/**
 * Extracts certificate request data from a CSR string
 * @param csr - The CSR in PEM format
 * @returns TCertificateRequest object with parsed CSR data
 */
export const extractCertificateRequestFromCSR = (csr: string): TCertificateRequest => {
  const csrObj = new x509.Pkcs10CertificateRequest(csr);
  const subject = parseDistinguishedName(csrObj.subject);

  const certificateRequest: TCertificateRequest = {
    commonName: subject.commonName,
    organization: subject.organization,
    organizationUnit: subject.ou,
    locality: subject.locality,
    state: subject.province,
    country: subject.country
  };

  const csrKeyUsageExtension = csrObj.getExtension("2.5.29.15") as x509.KeyUsagesExtension;
  if (csrKeyUsageExtension) {
    const csrKeyUsages = Object.values(CertKeyUsage).filter(
      // eslint-disable-next-line no-bitwise
      (keyUsage) => (x509.KeyUsageFlags[keyUsage] & csrKeyUsageExtension.usages) !== 0
    );
    certificateRequest.keyUsages = csrKeyUsages.map(mapLegacyKeyUsageToStandard);
  }

  const csrExtendedKeyUsageExtension = csrObj.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension;
  if (csrExtendedKeyUsageExtension) {
    const csrExtendedKeyUsages = csrExtendedKeyUsageExtension.usages.map(
      (ekuOid) => CertExtendedKeyUsageOIDToName[ekuOid as string]
    );
    certificateRequest.extendedKeyUsages = csrExtendedKeyUsages.map(mapLegacyExtendedKeyUsageToStandard);
  }

  const sanExtension = csrObj.extensions.find((ext) => ext.type === "2.5.29.17");
  if (sanExtension) {
    const sanNames = new x509.GeneralNames(sanExtension.value);
    const altNamesArray: TAltNameMapping[] = sanNames.items
      .filter(
        (value) =>
          value.type === TAltNameType.EMAIL ||
          value.type === TAltNameType.DNS ||
          value.type === TAltNameType.IP ||
          value.type === TAltNameType.URL
      )
      .map((name): TAltNameMapping => {
        const altNameType = validateAndMapAltNameType(name.value);
        if (!altNameType) {
          throw new BadRequestError({ message: `Invalid altName from CSR: ${name.value}` });
        }
        return altNameType;
      });

    certificateRequest.subjectAlternativeNames = altNamesArray.map((altName) => ({
      type: mapLegacyAltNameType(altName.type),
      value: altName.value
    }));
  }

  return certificateRequest;
};

/**
 * Extracts the key algorithm and signature algorithm from a CSR
 * @param csr - The CSR in PEM format
 * @returns Object containing keyAlgorithm and signatureAlgorithm
 */
export const extractAlgorithmsFromCSR = (csr: string) => {
  const csrObj = new x509.Pkcs10CertificateRequest(csr);

  // Extract key algorithm from public key
  const { publicKey } = csrObj;
  let keyAlgorithm: CertKeyAlgorithm;

  if (publicKey.algorithm.name === "RSASSA-PKCS1-v1_5") {
    const rsaPublicKey = publicKey as unknown as { algorithm: { modulusLength: number } };
    const keySize = rsaPublicKey.algorithm.modulusLength;
    switch (keySize) {
      case 2048:
        keyAlgorithm = CertKeyAlgorithm.RSA_2048;
        break;
      case 3072:
        keyAlgorithm = CertKeyAlgorithm.RSA_3072;
        break;
      case 4096:
        keyAlgorithm = CertKeyAlgorithm.RSA_4096;
        break;
      default:
        throw new BadRequestError({
          message: `Unsupported RSA key size in CSR: ${keySize}. Supported: 2048, 3072, 4096`
        });
    }
  } else if (publicKey.algorithm.name === "ECDSA") {
    const ecPublicKey = publicKey as unknown as { algorithm: { namedCurve: string } };
    const { namedCurve } = ecPublicKey.algorithm;
    switch (namedCurve) {
      case "P-256":
        keyAlgorithm = CertKeyAlgorithm.ECDSA_P256;
        break;
      case "P-384":
        keyAlgorithm = CertKeyAlgorithm.ECDSA_P384;
        break;
      case "P-521":
        keyAlgorithm = CertKeyAlgorithm.ECDSA_P521;
        break;
      default:
        throw new BadRequestError({
          message: `Unsupported ECDSA curve in CSR: ${namedCurve}. Supported: P-256, P-384, P-521`
        });
    }
  } else {
    throw new BadRequestError({
      message: `Unsupported key algorithm in CSR: ${publicKey.algorithm.name}. Supported: RSASSA-PKCS1-v1_5, ECDSA`
    });
  }

  const signatureAlgorithm = csrObj.signatureAlgorithm.name;
  const hashName = (csrObj.signatureAlgorithm as unknown as { hash?: { name: string } }).hash?.name;

  let normalizedSignatureAlg: CertSignatureAlgorithm;

  if (signatureAlgorithm === "RSASSA-PKCS1-v1_5") {
    switch (hashName) {
      case "SHA-256":
        normalizedSignatureAlg = CertSignatureAlgorithm.RSA_SHA256;
        break;
      case "SHA-384":
        normalizedSignatureAlg = CertSignatureAlgorithm.RSA_SHA384;
        break;
      case "SHA-512":
        normalizedSignatureAlg = CertSignatureAlgorithm.RSA_SHA512;
        break;
      default:
        throw new BadRequestError({
          message: `Unsupported RSA hash algorithm in CSR: ${hashName}. Supported: SHA-256, SHA-384, SHA-512`
        });
    }
  } else if (signatureAlgorithm === "ECDSA") {
    switch (hashName) {
      case "SHA-256":
        normalizedSignatureAlg = CertSignatureAlgorithm.ECDSA_SHA256;
        break;
      case "SHA-384":
        normalizedSignatureAlg = CertSignatureAlgorithm.ECDSA_SHA384;
        break;
      case "SHA-512":
        normalizedSignatureAlg = CertSignatureAlgorithm.ECDSA_SHA512;
        break;
      default:
        throw new BadRequestError({
          message: `Unsupported ECDSA hash algorithm in CSR: ${hashName}. Supported: SHA-256, SHA-384, SHA-512`
        });
    }
  } else {
    throw new BadRequestError({
      message: `Unsupported signature algorithm in CSR: ${signatureAlgorithm}. Supported: RSASSA-PKCS1-v1_5, ECDSA`
    });
  }

  return {
    keyAlgorithm,
    signatureAlgorithm: normalizedSignatureAlg
  };
};
