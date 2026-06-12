import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { isValidIp } from "@app/lib/ip";
import { ms } from "@app/lib/ms";
import { isFQDN } from "@app/lib/validator/validate-url";
import { ActorType } from "@app/services/auth/auth-type";
import { constructPemChainFromCerts } from "@app/services/certificate/certificate-fns";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createDistinguishedName,
  createSerialNumber,
  extractDnParts,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { extractAlgorithmsFromCSR } from "@app/services/certificate-common/certificate-csr-utils";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionKmipActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionKmipActions, ProjectPermissionSub } from "../permission/project-permission";
import { TKmipClientCertificateDALFactory } from "./kmip-client-certificate-dal";
import { TKmipClientDALFactory } from "./kmip-client-dal";
import { TKmipOrgConfigDALFactory } from "./kmip-org-config-dal";
import { TKmipOrgServerCertificateDALFactory } from "./kmip-org-server-certificate-dal";
import {
  TCreateKmipClientCertificateDTO,
  TCreateKmipClientDTO,
  TDeleteKmipClientDTO,
  TGenerateOrgKmipServerCertificateDTO,
  TGetKmipClientDTO,
  TListKmipClientsByProjectIdDTO,
  TRegisterServerDTO,
  TUpdateKmipClientDTO
} from "./kmip-types";

// Serials are stored as fixed 40-char lowercase hex (crypto.randomBytes(20).toString("hex")), but the
// daemon sends them derived from a Go big.Int in differing forms (decimal for client, hex for server,
// leading zeros dropped). Reduce any representation to the canonical stored form via BigInt. For an
// all-digit input the base is ambiguous, so emit both the decimal and hex readings as candidates.
const normalizeSerialNumberCandidates = (raw: string): string[] => {
  const value = raw.trim();
  const candidates = new Set<string>();
  const toCanonical = (n: bigint) => n.toString(16).padStart(40, "0");

  if (new RE2(/^[0-9a-fA-F]+$/).test(value)) {
    try {
      candidates.add(toCanonical(BigInt(`0x${value}`)));
    } catch {
      // not a valid hex serial
    }
  }
  if (new RE2(/^[0-9]+$/).test(value)) {
    try {
      candidates.add(toCanonical(BigInt(value)));
    } catch {
      // not a valid decimal serial
    }
  }

  return [...candidates];
};

type TKmipServiceFactoryDep = {
  kmipClientDAL: TKmipClientDALFactory;
  kmipClientCertificateDAL: TKmipClientCertificateDALFactory;
  kmipOrgServerCertificateDAL: TKmipOrgServerCertificateDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  kmipOrgConfigDAL: TKmipOrgConfigDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TKmipServiceFactory = ReturnType<typeof kmipServiceFactory>;

export const kmipServiceFactory = ({
  kmipClientDAL,
  permissionService,
  kmipClientCertificateDAL,
  kmipOrgConfigDAL,
  kmsService,
  kmipOrgServerCertificateDAL,
  licenseService
}: TKmipServiceFactoryDep) => {
  const DEFAULT_CA_KEY_ALGORITHM = CertKeyAlgorithm.RSA_2048;

  /**
   * Initializes and returns the KMIP PKI CA hierarchy for an organization.
   * If the org config already exists, returns it. Otherwise, creates the full PKI hierarchy
   * (Root CA, Server Intermediate CA, Client Intermediate CA) within a transaction with advisory lock.
   */
  const $getOrgKmipCAs = async (orgId: string, caKeyAlgorithm: CertKeyAlgorithm = DEFAULT_CA_KEY_ALGORITHM) => {
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const kmipOrgConfig = await kmipOrgConfigDAL.transaction(async (tx) => {
      const existingConfig = await kmipOrgConfigDAL.findOne({ orgId }, tx);
      if (existingConfig) return existingConfig;

      // Acquire advisory lock to prevent race conditions during initialization
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgKmipInit(orgId)]);

      // Double-check after acquiring lock
      const configAfterLock = await kmipOrgConfigDAL.findOne({ orgId }, tx);
      if (configAfterLock) return configAfterLock;

      const alg = keyAlgorithmToAlgCfg(caKeyAlgorithm);

      // generate root CA
      const rootCaSerialNumber = createSerialNumber();
      const rootCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const rootCaSkObj = crypto.nativeCrypto.KeyObject.from(rootCaKeys.privateKey);
      const rootCaIssuedAt = new Date();
      const rootCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 20));

      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `CN=KMIP Root CA,OU=${orgId}`,
        serialNumber: rootCaSerialNumber,
        notBefore: rootCaIssuedAt,
        notAfter: rootCaExpiration,
        signingAlgorithm: alg,
        keys: rootCaKeys,
        extensions: [
          // eslint-disable-next-line no-bitwise
          new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
          await x509.SubjectKeyIdentifierExtension.create(rootCaKeys.publicKey)
        ]
      });

      // generate intermediate server CA
      const serverIntermediateCaSerialNumber = createSerialNumber();
      const serverIntermediateCaIssuedAt = new Date();
      const serverIntermediateCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 10));
      const serverIntermediateCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const serverIntermediateCaSkObj = crypto.nativeCrypto.KeyObject.from(serverIntermediateCaKeys.privateKey);

      const serverIntermediateCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: serverIntermediateCaSerialNumber,
        subject: `CN=KMIP Server Intermediate CA,OU=${orgId}`,
        issuer: rootCaCert.subject,
        notBefore: serverIntermediateCaIssuedAt,
        notAfter: serverIntermediateCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: serverIntermediateCaKeys.publicKey,
        signingAlgorithm: alg,
        extensions: [
          new x509.KeyUsagesExtension(
            // eslint-disable-next-line no-bitwise
            x509.KeyUsageFlags.keyCertSign |
              x509.KeyUsageFlags.cRLSign |
              x509.KeyUsageFlags.digitalSignature |
              x509.KeyUsageFlags.keyEncipherment,
            true
          ),
          new x509.BasicConstraintsExtension(true, 0, true),
          await x509.AuthorityKeyIdentifierExtension.create(rootCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(serverIntermediateCaKeys.publicKey)
        ]
      });

      // generate intermediate client CA
      const clientIntermediateCaSerialNumber = createSerialNumber();
      const clientIntermediateCaIssuedAt = new Date();
      const clientIntermediateCaExpiration = new Date(new Date().setFullYear(new Date().getFullYear() + 10));
      const clientIntermediateCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const clientIntermediateCaSkObj = crypto.nativeCrypto.KeyObject.from(clientIntermediateCaKeys.privateKey);

      const clientIntermediateCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: clientIntermediateCaSerialNumber,
        subject: `CN=KMIP Client Intermediate CA,OU=${orgId}`,
        issuer: rootCaCert.subject,
        notBefore: clientIntermediateCaIssuedAt,
        notAfter: clientIntermediateCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: clientIntermediateCaKeys.publicKey,
        signingAlgorithm: alg,
        extensions: [
          new x509.KeyUsagesExtension(
            // eslint-disable-next-line no-bitwise
            x509.KeyUsageFlags.keyCertSign |
              x509.KeyUsageFlags.cRLSign |
              x509.KeyUsageFlags.digitalSignature |
              x509.KeyUsageFlags.keyEncipherment,
            true
          ),
          new x509.BasicConstraintsExtension(true, 0, true),
          await x509.AuthorityKeyIdentifierExtension.create(rootCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(clientIntermediateCaKeys.publicKey)
        ]
      });

      return kmipOrgConfigDAL.create(
        {
          orgId,
          caKeyAlgorithm,
          rootCaIssuedAt,
          rootCaExpiration,
          rootCaSerialNumber,
          encryptedRootCaCertificate: orgKmsEncryptor({ plainText: Buffer.from(rootCaCert.rawData) }).cipherTextBlob,
          encryptedRootCaPrivateKey: orgKmsEncryptor({
            plainText: rootCaSkObj.export({
              type: "pkcs8",
              format: "der"
            })
          }).cipherTextBlob,
          serverIntermediateCaIssuedAt,
          serverIntermediateCaExpiration,
          serverIntermediateCaSerialNumber,
          encryptedServerIntermediateCaCertificate: orgKmsEncryptor({
            plainText: Buffer.from(new Uint8Array(serverIntermediateCaCert.rawData))
          }).cipherTextBlob,
          encryptedServerIntermediateCaChain: orgKmsEncryptor({ plainText: Buffer.from(rootCaCert.toString("pem")) })
            .cipherTextBlob,
          encryptedServerIntermediateCaPrivateKey: orgKmsEncryptor({
            plainText: serverIntermediateCaSkObj.export({
              type: "pkcs8",
              format: "der"
            })
          }).cipherTextBlob,
          clientIntermediateCaIssuedAt,
          clientIntermediateCaExpiration,
          clientIntermediateCaSerialNumber,
          encryptedClientIntermediateCaCertificate: orgKmsEncryptor({
            plainText: Buffer.from(new Uint8Array(clientIntermediateCaCert.rawData))
          }).cipherTextBlob,
          encryptedClientIntermediateCaChain: orgKmsEncryptor({ plainText: Buffer.from(rootCaCert.toString("pem")) })
            .cipherTextBlob,
          encryptedClientIntermediateCaPrivateKey: orgKmsEncryptor({
            plainText: clientIntermediateCaSkObj.export({
              type: "pkcs8",
              format: "der"
            })
          }).cipherTextBlob
        },
        tx
      );
    });

    // Decrypt and return the CA certificates and keys
    const rootCaCertificate = orgKmsDecryptor({ cipherTextBlob: kmipOrgConfig.encryptedRootCaCertificate });
    const rootCaPrivateKey = orgKmsDecryptor({ cipherTextBlob: kmipOrgConfig.encryptedRootCaPrivateKey });

    const serverIntermediateCaCertificate = orgKmsDecryptor({
      cipherTextBlob: kmipOrgConfig.encryptedServerIntermediateCaCertificate
    });
    const serverIntermediateCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: kmipOrgConfig.encryptedServerIntermediateCaPrivateKey
    });
    const serverIntermediateCaChain = orgKmsDecryptor({
      cipherTextBlob: kmipOrgConfig.encryptedServerIntermediateCaChain
    });

    const clientIntermediateCaCertificate = orgKmsDecryptor({
      cipherTextBlob: kmipOrgConfig.encryptedClientIntermediateCaCertificate
    });
    const clientIntermediateCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: kmipOrgConfig.encryptedClientIntermediateCaPrivateKey
    });
    const clientIntermediateCaChain = orgKmsDecryptor({
      cipherTextBlob: kmipOrgConfig.encryptedClientIntermediateCaChain
    });

    return {
      config: kmipOrgConfig,
      rootCaCertificate,
      rootCaPrivateKey,
      serverIntermediateCaCertificate,
      serverIntermediateCaPrivateKey,
      serverIntermediateCaChain,
      clientIntermediateCaCertificate,
      clientIntermediateCaPrivateKey,
      clientIntermediateCaChain
    };
  };

  const createKmipClient = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    name,
    description,
    permissions
  }: TCreateKmipClientDTO) => {
    if (crypto.isFipsModeEnabled()) {
      throw new BadRequestError({
        message: "KMIP is currently not supported in FIPS mode of operation."
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.CreateClients,
      ProjectPermissionSub.Kmip
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.kmip)
      throw new BadRequestError({
        message: "Failed to create KMIP client. Upgrade your plan to enterprise."
      });

    const kmipClient = await kmipClientDAL.create({
      projectId,
      name,
      description,
      permissions
    });

    return kmipClient;
  };

  const updateKmipClient = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name,
    description,
    permissions,
    id
  }: TUpdateKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${id} does not exist`
      });
    }

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.kmip)
      throw new BadRequestError({
        message: "Failed to update KMIP client. Upgrade your plan to enterprise."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.UpdateClients,
      ProjectPermissionSub.Kmip
    );

    const updatedKmipClient = await kmipClientDAL.updateById(id, {
      name,
      description,
      permissions
    });

    return updatedKmipClient;
  };

  const deleteKmipClient = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TDeleteKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${id} does not exist`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.DeleteClients,
      ProjectPermissionSub.Kmip
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.kmip)
      throw new BadRequestError({
        message: "Failed to delete KMIP client. Upgrade your plan to enterprise."
      });

    const deletedKmipClient = await kmipClientDAL.deleteById(id);

    return deletedKmipClient;
  };

  const getKmipClient = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TGetKmipClientDTO) => {
    const kmipClient = await kmipClientDAL.findById(id);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${id} does not exist`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionKmipActions.ReadClients, ProjectPermissionSub.Kmip);

    return kmipClient;
  };

  const listKmipClientsByProjectId = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    ...rest
  }: TListKmipClientsByProjectIdDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionKmipActions.ReadClients, ProjectPermissionSub.Kmip);

    return kmipClientDAL.findByProjectId({ projectId, ...rest });
  };

  const createKmipClientCertificate = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    ttl,
    keyAlgorithm,
    clientId,
    csr
  }: TCreateKmipClientCertificateDTO) => {
    const kmipClient = await kmipClientDAL.findById(clientId);

    if (!kmipClient) {
      throw new NotFoundError({
        message: `KMIP client with ID ${clientId} does not exist`
      });
    }

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.kmip)
      throw new BadRequestError({
        message: "Failed to create KMIP client. Upgrade your plan to enterprise."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: kmipClient.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionKmipActions.GenerateClientCertificates,
      ProjectPermissionSub.Kmip
    );

    // Lazily initialize KMIP org config if not already set up
    const orgKmipCAs = await $getOrgKmipCAs(actorOrgId);

    const caCertObj = new x509.X509Certificate(orgKmipCAs.clientIntermediateCaCertificate);

    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(ttl));

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const caAlg = keyAlgorithmToAlgCfg(orgKmipCAs.config.caKeyAlgorithm as CertKeyAlgorithm);

    const caSkObj = crypto.nativeCrypto.createPrivateKey({
      key: orgKmipCAs.clientIntermediateCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const caPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      caSkObj.export({ format: "der", type: "pkcs8" }),
      caAlg,
      true,
      ["sign"]
    );

    const serialNumber = createSerialNumber();
    let leafCert: x509.X509Certificate;
    let effectiveKeyAlgorithm: CertKeyAlgorithm;
    let privateKeyPem: string | undefined;

    if (csr) {
      // CSR mode - sign the provided CSR
      const csrObj = new x509.Pkcs10CertificateRequest(csr);

      // Validate CSR signature
      const isValid = await csrObj.verify();
      if (!isValid) {
        throw new BadRequestError({ message: "Invalid CSR signature" });
      }

      // Extract key algorithm from CSR
      const { keyAlgorithm: csrKeyAlgorithm } = extractAlgorithmsFromCSR(csr);
      effectiveKeyAlgorithm = csrKeyAlgorithm;

      // Extract additional subject fields from CSR (O, L, ST, C) and build DN with proper escaping
      const dn = extractDnParts(csrObj.subjectName);
      const subject = createDistinguishedName({
        commonName: clientId,
        ou: kmipClient.projectId,
        organization: dn.organization,
        locality: dn.locality,
        province: dn.province,
        country: dn.country
      });

      const extensions: x509.Extension[] = [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
        await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey),
        new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_AGREEMENT],
          true
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.CLIENT_AUTH]], true)
      ];

      leafCert = await x509.X509CertificateGenerator.create({
        serialNumber,
        subject,
        issuer: caCertObj.subject,
        notBefore: notBeforeDate,
        notAfter: notAfterDate,
        signingKey: caPrivateKey,
        publicKey: csrObj.publicKey,
        signingAlgorithm: caAlg,
        extensions
      });
    } else {
      // Managed mode - server generates key pair (existing behavior)
      if (!keyAlgorithm) {
        throw new BadRequestError({ message: "keyAlgorithm is required when not providing a CSR" });
      }
      effectiveKeyAlgorithm = keyAlgorithm;

      const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
      const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

      const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
      privateKeyPem = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

      const subject = createDistinguishedName({
        commonName: clientId,
        ou: kmipClient.projectId
      });

      const extensions: x509.Extension[] = [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
        await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
        new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_AGREEMENT],
          true
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.CLIENT_AUTH]], true)
      ];

      leafCert = await x509.X509CertificateGenerator.create({
        serialNumber,
        subject,
        issuer: caCertObj.subject,
        notBefore: notBeforeDate,
        notAfter: notAfterDate,
        signingKey: caPrivateKey,
        publicKey: leafKeys.publicKey,
        signingAlgorithm: alg,
        extensions
      });
    }

    const rootCaCert = new x509.X509Certificate(orgKmipCAs.rootCaCertificate);
    const serverIntermediateCaCert = new x509.X509Certificate(orgKmipCAs.serverIntermediateCaCertificate);

    await kmipClientCertificateDAL.create({
      kmipClientId: clientId,
      keyAlgorithm: effectiveKeyAlgorithm,
      issuedAt: notBeforeDate,
      expiration: notAfterDate,
      serialNumber
    });

    return {
      serialNumber,
      certificate: leafCert.toString("pem"),
      certificateChain: constructPemChainFromCerts([serverIntermediateCaCert, rootCaCert]),
      projectId: kmipClient.projectId,
      ...(privateKeyPem && { privateKey: privateKeyPem })
    };
  };

  const getServerCertificateBySerialNumber = async (orgId: string, serialNumber: string) => {
    const serverCert = await kmipOrgServerCertificateDAL.findOne({
      serialNumber,
      orgId
    });

    if (!serverCert) {
      throw new NotFoundError({
        message: "Server certificate not found"
      });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const parsedCertificate = new x509.X509Certificate(decryptor({ cipherTextBlob: serverCert.encryptedCertificate }));

    return {
      publicKey: parsedCertificate.publicKey.toString("pem"),
      keyAlgorithm: serverCert.keyAlgorithm as CertKeyAlgorithm
    };
  };

  const generateOrgKmipServerCertificate = async ({
    orgId,
    ttl,
    commonName,
    altNames,
    keyAlgorithm
  }: TGenerateOrgKmipServerCertificateDTO) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.kmip)
      throw new BadRequestError({
        message: "Failed to generate KMIP server certificate. Upgrade your plan to enterprise."
      });

    // Initialize KMIP org config (or return existing one)
    const orgKmipCAs = await $getOrgKmipCAs(orgId);

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const caCertObj = new x509.X509Certificate(orgKmipCAs.serverIntermediateCaCertificate);

    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(ttl));

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(keyAlgorithm);

    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true)
    ];

    const altNamesArray: {
      type: "email" | "dns" | "ip";
      value: string;
    }[] = altNames
      .split(",")
      .map((name) => name.trim())
      .map((altName) => {
        if (isFQDN(altName, { allow_wildcard: true })) {
          return {
            type: "dns",
            value: altName
          };
        }

        if (isValidIp(altName)) {
          return {
            type: "ip",
            value: altName
          };
        }

        throw new Error(`Invalid altName: ${altName}`);
      });

    const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
    extensions.push(altNamesExtension);

    const caAlg = keyAlgorithmToAlgCfg(orgKmipCAs.config.caKeyAlgorithm as CertKeyAlgorithm);

    const decryptedCaCertChain = orgKmipCAs.serverIntermediateCaChain.toString("utf-8");

    const caSkObj = crypto.nativeCrypto.createPrivateKey({
      key: orgKmipCAs.serverIntermediateCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const caPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      caSkObj.export({ format: "der", type: "pkcs8" }),
      caAlg,
      true,
      ["sign"]
    );

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `CN=${commonName}`,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: leafKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const certificateChain = `${caCertObj.toString("pem")}\n${decryptedCaCertChain}`.trim();

    await kmipOrgServerCertificateDAL.create({
      orgId,
      keyAlgorithm,
      issuedAt: notBeforeDate,
      expiration: notAfterDate,
      serialNumber,
      commonName,
      altNames,
      encryptedCertificate: encryptor({ plainText: Buffer.from(new Uint8Array(leafCert.rawData)) }).cipherTextBlob,
      encryptedChain: encryptor({ plainText: Buffer.from(certificateChain) }).cipherTextBlob
    });

    return {
      serialNumber,
      privateKey: skLeafObj.export({ format: "pem", type: "pkcs8" }) as string,
      certificate: leafCert.toString("pem"),
      certificateChain
    };
  };

  const registerServer = async ({
    actorOrgId,
    actor,
    actorId,
    actorAuthMethod,
    ttl,
    commonName,
    keyAlgorithm,
    hostnamesOrIps
  }: TRegisterServerDTO) => {
    // KMIP servers authenticate via their enrollment-based access token, which is itself the
    // authorization — no org-level permission needed. The legacy machine-identity path still
    // requires the (deprecated) KMIP proxy permission.
    if (actor !== ActorType.KMIP_SERVER) {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: actorOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionKmipActions.Proxy, OrgPermissionSubjects.Kmip);
    }

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.kmip)
      throw new BadRequestError({
        message: "Failed to register KMIP server. Upgrade your plan to enterprise."
      });

    // Initialize KMIP org config (or return existing one)
    const orgKmipCAs = await $getOrgKmipCAs(actorOrgId);

    const { privateKey, certificate, certificateChain, serialNumber } = await generateOrgKmipServerCertificate({
      orgId: actorOrgId,
      commonName: commonName ?? "kmip-server",
      altNames: hostnamesOrIps,
      keyAlgorithm: keyAlgorithm ?? (orgKmipCAs.config.caKeyAlgorithm as CertKeyAlgorithm),
      ttl
    });

    const rootCaCert = new x509.X509Certificate(orgKmipCAs.rootCaCertificate);
    const clientIntermediateCaCert = new x509.X509Certificate(orgKmipCAs.clientIntermediateCaCertificate);
    const clientCertificateChain = constructPemChainFromCerts([clientIntermediateCaCert, rootCaCert]);

    return {
      serverCertificateSerialNumber: serialNumber,
      clientCertificateChain,
      privateKey,
      certificate,
      certificateChain
    };
  };

  // Validates that the presented certs were actually issued by this org.
  // Revocation checking is out of scope until KMIP certs gain a revocation model.
  const validateKmipSessionCertificates = async ({
    orgId,
    kmipClientId,
    clientCertificateSerialNumber,
    serverCertificateSerialNumber
  }: {
    orgId: string;
    kmipClientId: string;
    clientCertificateSerialNumber: string;
    serverCertificateSerialNumber: string;
  }) => {
    const serverCertCandidates = normalizeSerialNumberCandidates(serverCertificateSerialNumber);
    const [serverCert] = serverCertCandidates.length
      ? await kmipOrgServerCertificateDAL.find({ orgId, $in: { serialNumber: serverCertCandidates } }, { limit: 1 })
      : [];
    if (!serverCert) {
      throw new ForbiddenRequestError({ message: "Invalid KMIP server certificate" });
    }

    const clientCertCandidates = normalizeSerialNumberCandidates(clientCertificateSerialNumber);
    const [clientCert] = clientCertCandidates.length
      ? await kmipClientCertificateDAL.find({ $in: { serialNumber: clientCertCandidates } }, { limit: 1 })
      : [];
    if (!clientCert || clientCert.kmipClientId !== kmipClientId) {
      throw new ForbiddenRequestError({
        message: "Client certificate does not match the specified KMIP client"
      });
    }
    if (new Date(clientCert.expiration).getTime() < Date.now()) {
      throw new ForbiddenRequestError({ message: "Client certificate has expired" });
    }
  };

  return {
    createKmipClient,
    updateKmipClient,
    deleteKmipClient,
    getKmipClient,
    listKmipClientsByProjectId,
    createKmipClientCertificate,
    generateOrgKmipServerCertificate,
    getServerCertificateBySerialNumber,
    registerServer,
    validateKmipSessionCertificates
  };
};
