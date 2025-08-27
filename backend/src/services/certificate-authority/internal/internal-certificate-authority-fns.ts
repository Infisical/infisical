/* eslint-disable no-bitwise */
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TCertificateTemplates, TPkiSubscribers } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  TAltNameMapping
} from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";
import { TPkiSubscriberProperties } from "@app/services/pki-subscriber/pki-subscriber-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { AzureAdCsCertificateAuthorityFns } from "../azure-ad-cs/azure-ad-cs-certificate-authority-fns";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus } from "../certificate-authority-enums";
import {
  createSerialNumber,
  getCaCertChain,
  getCaCredentials,
  keyAlgorithmToAlgCfg
} from "../certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "../certificate-authority-secret-dal";
import { validateAndMapAltNameType } from "../certificate-authority-validators";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import { TIssueCertWithTemplateDTO } from "./internal-certificate-authority-types";

type TInternalCertificateAuthorityFnsDeps = {
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "findByIdWithAssociatedCa" | "findById" | "create" | "transaction" | "updateById" | "findWithAssociatedCa"
  >;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "transaction" | "findOne" | "updateById">;
  kmsService: Pick<
    TKmsServiceFactory,
    "decryptWithKmsKey" | "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  appConnectionDAL?: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  appConnectionService?: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  externalCertificateAuthorityDAL?: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  pkiSubscriberDAL?: Pick<TPkiSubscriberDALFactory, "findById">;
};

const buildSubjectDN = (commonName: string, properties?: TPkiSubscriberProperties): string => {
  // Validate and sanitize common name - it's required and cannot be empty
  if (!commonName || !commonName.trim()) {
    throw new BadRequestError({ message: "Common Name is required and cannot be empty" });
  }

  const sanitizedCN = commonName.trim().replace(/[,=+<>#;\\]/g, ""); // Remove problematic characters
  if (!sanitizedCN) {
    throw new BadRequestError({ message: "Common Name contains only invalid characters" });
  }

  let subject = `CN=${sanitizedCN}`;

  // Helper function to validate and sanitize DN component values
  const sanitizeComponent = (value: string | undefined): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Remove problematic characters for DN components
    const sanitized = trimmed.replace(/[,=+<>#;\\"/\r\n\t]/g, "").trim();

    // Additional validation to prevent empty components
    if (sanitized.length === 0) return null;

    // Ensure the component doesn't start or end with spaces or problematic chars
    const finalSanitized = sanitized.replace(/^[\s-_.]+|[\s-_.]+$/g, "");

    return finalSanitized.length > 0 ? finalSanitized : null;
  };

  // Build DN components in proper X.500 ordering
  const emailAddress = sanitizeComponent(properties?.emailAddress);
  if (emailAddress) {
    // Enhanced email validation for DN usage
    const emailRegex = new RE2(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
    if (emailRegex.test(emailAddress) && emailAddress.length > 5 && emailAddress.length < 64) {
      subject += `,E=${emailAddress}`;
    }
  }

  const organizationalUnit = sanitizeComponent(properties?.organizationalUnit);
  if (organizationalUnit && organizationalUnit.length <= 64) {
    subject += `,OU=${organizationalUnit}`;
  }

  const organization = sanitizeComponent(properties?.organization);
  if (organization && organization.length <= 64) {
    subject += `,O=${organization}`;
  }

  const locality = sanitizeComponent(properties?.locality);
  if (locality && locality.length <= 64) {
    subject += `,L=${locality}`;
  }

  const state = sanitizeComponent(properties?.state);
  if (state && state.length <= 64) {
    subject += `,ST=${state}`;
  }

  const country = sanitizeComponent(properties?.country);
  if (country) {
    // Country code must be exactly 2 uppercase letters
    const countryCode = country.toUpperCase().replace(/[^A-Z]/g, "");
    if (countryCode.length === 2) {
      subject += `,C=${countryCode}`;
    }
  }

  return subject;
};

export const InternalCertificateAuthorityFns = ({
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  projectDAL,
  kmsService,
  certificateAuthoritySecretDAL,
  certificateAuthorityCrlDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  appConnectionDAL,
  appConnectionService,
  externalCertificateAuthorityDAL,
  pkiSubscriberDAL
}: TInternalCertificateAuthorityFnsDeps) => {
  const issueCertificate = async (
    subscriber: TPkiSubscribers,
    ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
  ) => {
    if (ca.status !== CaStatus.ACTIVE) throw new BadRequestError({ message: "CA is not active" });
    if (!ca.internalCa?.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);
    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(subscriber.ttl ?? "0"));
    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);
    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: buildSubjectDN(subscriber.commonName, subscriber.properties as TPkiSubscriberProperties | undefined),
      keys: leafKeys,
      signingAlgorithm: alg,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment)
      ],
      attributes: [new x509.ChallengePasswordAttribute("password")]
    });

    const { caPrivateKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const appCfg = getConfig();

    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/pki/crl/${caCrl.id}/der`;
    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/pki/ca/${ca.id}/certificates/${caCert.id}/der`;

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      new x509.CRLDistributionPointsExtension([distributionPointUrl]),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey),
      new x509.AuthorityInfoAccessExtension({
        caIssuers: new x509.GeneralName("url", caIssuerUrl)
      }),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]) // anyPolicy
    ];

    const selectedKeyUsages = subscriber.keyUsages as CertKeyUsage[];
    // eslint-disable-next-line no-bitwise
    const keyUsagesBitValue = selectedKeyUsages.reduce((accum, keyUsage) => accum | x509.KeyUsageFlags[keyUsage], 0);
    if (keyUsagesBitValue) {
      extensions.push(new x509.KeyUsagesExtension(keyUsagesBitValue, true));
    }

    if (subscriber.extendedKeyUsages.length) {
      const extendedKeyUsagesExtension = new x509.ExtendedKeyUsageExtension(
        subscriber.extendedKeyUsages.map((eku) => x509.ExtendedKeyUsage[eku as CertExtendedKeyUsage]),
        true
      );
      extensions.push(extendedKeyUsagesExtension);
    }

    let altNamesArray: TAltNameMapping[] = [];

    if (subscriber.subjectAlternativeNames?.length) {
      altNamesArray = subscriber.subjectAlternativeNames.map((altName) => {
        const altNameType = validateAndMapAltNameType(altName);
        if (!altNameType) {
          throw new BadRequestError({ message: `Invalid SAN entry: ${altName}` });
        }
        return altNameType;
      });

      const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
      extensions.push(altNamesExtension);
    }

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: csrObj.subject,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(leafCert.rawData))
    });
    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(skLeaf)
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: caCert.id,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const certificateChainPem = `${issuingCaCertificate}\n${caCertChain}`.trim();

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          caCertId: caCert.id,
          pkiSubscriberId: subscriber.id,
          status: CertStatus.ACTIVE,
          friendlyName: subscriber.commonName,
          commonName: subscriber.commonName,
          altNames: subscriber.subjectAlternativeNames.join(","),
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          keyUsages: selectedKeyUsages,
          extendedKeyUsages: subscriber.extendedKeyUsages as CertExtendedKeyUsage[],
          projectId: ca.projectId
        },
        tx
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        tx
      );
    });

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: certificateChainPem,
      issuingCaCertificate,
      privateKey: skLeaf,
      serialNumber,
      ca,
      subscriber
    };
  };

  const issueCertificateWithTemplate = async (
    ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>,
    certificateTemplate: TCertificateTemplates,
    { altNames, commonName, ttl, extendedKeyUsages, keyUsages, notAfter, notBefore }: TIssueCertWithTemplateDTO
  ) => {
    if (ca.status !== CaStatus.ACTIVE) throw new BadRequestError({ message: "CA is not active" });
    if (!ca.internalCa?.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);
    const notBeforeDate = notBefore ? new Date(notBefore) : new Date();

    let notAfterDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    if (notAfter) {
      notAfterDate = new Date(notAfter);
    } else if (ttl) {
      notAfterDate = new Date(new Date().getTime() + ms(ttl));
    }

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const commonNameRegex = new RE2(certificateTemplate.commonName);
    if (!commonNameRegex.test(commonName)) {
      throw new BadRequestError({
        message: "Invalid common name based on template policy"
      });
    }

    if (notAfterDate.getTime() - notBeforeDate.getTime() > ms(certificateTemplate.ttl)) {
      throw new BadRequestError({
        message: "Invalid validity date based on template policy"
      });
    }

    const subjectAlternativeNameRegex = new RE2(certificateTemplate.subjectAlternativeName);
    altNames.split(",").forEach((altName) => {
      if (!subjectAlternativeNameRegex.test(altName)) {
        throw new BadRequestError({
          message: "Invalid subject alternative name based on template policy"
        });
      }
    });

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);
    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: `CN=${commonName}`,
      keys: leafKeys,
      signingAlgorithm: alg,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment)
      ],
      attributes: [new x509.ChallengePasswordAttribute("password")]
    });

    const { caPrivateKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const appCfg = getConfig();

    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/pki/crl/${caCrl.id}/der`;
    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/pki/ca/${ca.id}/certificates/${caCert.id}/der`;

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      new x509.CRLDistributionPointsExtension([distributionPointUrl]),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey),
      new x509.AuthorityInfoAccessExtension({
        caIssuers: new x509.GeneralName("url", caIssuerUrl)
      }),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]) // anyPolicy
    ];

    let selectedKeyUsages: CertKeyUsage[] = keyUsages ?? [];
    if (keyUsages === undefined && !certificateTemplate) {
      selectedKeyUsages = [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT];
    }

    if (keyUsages === undefined && certificateTemplate) {
      selectedKeyUsages = (certificateTemplate.keyUsages ?? []) as CertKeyUsage[];
    }

    if (keyUsages?.length && certificateTemplate) {
      const validKeyUsages = certificateTemplate.keyUsages || [];
      if (keyUsages.some((keyUsage) => !validKeyUsages.includes(keyUsage))) {
        throw new BadRequestError({
          message: "Invalid key usage value based on template policy"
        });
      }
      selectedKeyUsages = keyUsages;
    }

    const keyUsagesBitValue = selectedKeyUsages.reduce((accum, keyUsage) => accum | x509.KeyUsageFlags[keyUsage], 0);
    if (keyUsagesBitValue) {
      extensions.push(new x509.KeyUsagesExtension(keyUsagesBitValue, true));
    }

    // handle extended key usages
    let selectedExtendedKeyUsages: CertExtendedKeyUsage[] = extendedKeyUsages ?? [];
    if (extendedKeyUsages === undefined && certificateTemplate) {
      selectedExtendedKeyUsages = (certificateTemplate.extendedKeyUsages ?? []) as CertExtendedKeyUsage[];
    }

    if (extendedKeyUsages?.length && certificateTemplate) {
      const validExtendedKeyUsages = certificateTemplate.extendedKeyUsages || [];
      if (extendedKeyUsages.some((eku) => !validExtendedKeyUsages.includes(eku))) {
        throw new BadRequestError({
          message: "Invalid extended key usage value based on template policy"
        });
      }
      selectedExtendedKeyUsages = extendedKeyUsages;
    }

    if (selectedExtendedKeyUsages.length) {
      extensions.push(
        new x509.ExtendedKeyUsageExtension(
          selectedExtendedKeyUsages.map((eku) => x509.ExtendedKeyUsage[eku]),
          true
        )
      );
    }

    let altNamesArray: TAltNameMapping[] = [];

    if (altNames) {
      altNamesArray = altNames.split(",").map((altName) => {
        const altNameType = validateAndMapAltNameType(altName);
        if (!altNameType) {
          throw new BadRequestError({ message: `Invalid SAN entry: ${altName}` });
        }
        return altNameType;
      });

      const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
      extensions.push(altNamesExtension);
    }

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: csrObj.subject,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(leafCert.rawData))
    });
    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(skLeaf)
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: caCert.id,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const certificateChainPem = `${issuingCaCertificate}\n${caCertChain}`.trim();

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          caCertId: caCert.id,
          status: CertStatus.ACTIVE,
          friendlyName: commonName,
          commonName,
          altNames,
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          keyUsages: selectedKeyUsages,
          extendedKeyUsages: selectedExtendedKeyUsages,
          projectId: ca.projectId,
          certificateTemplateId: certificateTemplate.id
        },
        tx
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        tx
      );
    });

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: certificateChainPem,
      issuingCaCertificate,
      privateKey: skLeaf,
      serialNumber,
      ca,
      template: certificateTemplate
    };
  };

  const issueCertificateWithAzureAdCs = async (subscriberId: string) => {
    if (!appConnectionDAL || !appConnectionService || !externalCertificateAuthorityDAL || !pkiSubscriberDAL) {
      throw new BadRequestError({ message: "Azure AD CS dependencies not available" });
    }

    const azureAdCsFns = AzureAdCsCertificateAuthorityFns({
      appConnectionDAL,
      appConnectionService,
      certificateAuthorityDAL,
      externalCertificateAuthorityDAL,
      certificateDAL,
      certificateBodyDAL,
      certificateSecretDAL,
      kmsService,
      projectDAL,
      pkiSubscriberDAL
    });

    return azureAdCsFns.orderSubscriberCertificate(subscriberId);
  };

  return {
    issueCertificate,
    issueCertificateWithTemplate,
    issueCertificateWithAzureAdCs
  };
};
