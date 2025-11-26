import * as x509 from "@peculiar/x509";
import acme, { CsrBuffer } from "acme-client";
import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, CryptographyError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";
import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";
import { TDNSMadeEasyConnection } from "@app/services/app-connection/dns-made-easy/dns-made-easy-connection-types";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus
} from "@app/services/certificate/certificate-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";
import { TPkiSyncDALFactory } from "@app/services/pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "@app/services/pki-sync/pki-sync-queue";
import { triggerAutoSyncForSubscriber } from "@app/services/pki-sync/pki-sync-utils";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import { AcmeDnsProvider } from "./acme-certificate-authority-enums";
import { AcmeCertificateAuthorityCredentialsSchema } from "./acme-certificate-authority-schemas";
import {
  TAcmeCertificateAuthority,
  TCreateAcmeCertificateAuthorityDTO,
  TUpdateAcmeCertificateAuthorityDTO
} from "./acme-certificate-authority-types";
import { cloudflareDeleteTxtRecord, cloudflareInsertTxtRecord } from "./dns-providers/cloudflare";
import { dnsMadeEasyDeleteTxtRecord, dnsMadeEasyInsertTxtRecord } from "./dns-providers/dns-made-easy";
import { route53DeleteTxtRecord, route53InsertTxtRecord } from "./dns-providers/route54";

type TAcmeCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById" | "findWithAssociatedCa" | "findById"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
};

type TOrderCertificateDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "update">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
};

type DBConfigurationColumn = {
  dnsProvider: string;
  directoryUrl: string;
  accountEmail: string;
  hostedZoneId: string;
  eabKid?: string;
  eabHmacKey?: string;
};

export const castDbEntryToAcmeCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TAcmeCertificateAuthority & { credentials: unknown } => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed ACME certificate authority" });
  }

  const dbConfigurationCol = ca.externalCa.configuration as DBConfigurationColumn;

  return {
    id: ca.id,
    type: CaType.ACME,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    credentials: ca.externalCa.credentials,
    configuration: {
      dnsAppConnectionId: ca.externalCa.dnsAppConnectionId as string,
      dnsProviderConfig: {
        provider: dbConfigurationCol.dnsProvider as AcmeDnsProvider,
        hostedZoneId: dbConfigurationCol.hostedZoneId
      },
      directoryUrl: dbConfigurationCol.directoryUrl,
      accountEmail: dbConfigurationCol.accountEmail,
      eabKid: dbConfigurationCol.eabKid,
      eabHmacKey: dbConfigurationCol.eabHmacKey
    },
    status: ca.status as CaStatus
  };
};

const getAcmeChallengeRecord = (
  provider: AcmeDnsProvider,
  identifierValue: string,
  keyAuthorization: string
): { recordName: string; recordValue: string } => {
  let recordName: string;
  if (provider === AcmeDnsProvider.DNSMadeEasy) {
    // For DNS Made Easy, we don't need to provide the domain name in the record name.
    recordName = "_acme-challenge";
  } else {
    recordName = `_acme-challenge.${identifierValue}`; // e.g., "_acme-challenge.example.com"
  }
  const recordValue = `"${keyAuthorization}"`; // must be double quoted
  return { recordName, recordValue };
};

export const orderCertificate = async (
  {
    caId,
    subscriberId,
    commonName,
    altNames,
    csr,
    csrPrivateKey,
    keyUsages,
    extendedKeyUsages
  }: {
    caId: string;
    subscriberId?: string;
    commonName: string;
    altNames?: string[];
    csr: CsrBuffer;
    csrPrivateKey?: string;
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
  },
  deps: TOrderCertificateDeps,
  tx?: Knex
) => {
  const {
    appConnectionDAL,
    certificateAuthorityDAL,
    externalCertificateAuthorityDAL,
    certificateDAL,
    certificateBodyDAL,
    certificateSecretDAL,
    kmsService,
    projectDAL
  } = deps;

  const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx);
  if (!ca.externalCa || ca.externalCa.type !== CaType.ACME) {
    throw new BadRequestError({ message: "CA is not an ACME CA" });
  }

  const acmeCa = castDbEntryToAcmeCertificateAuthority(ca);
  if (acmeCa.status !== CaStatus.ACTIVE) {
    throw new BadRequestError({ message: "CA is disabled" });
  }

  const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
    projectId: ca.projectId,
    projectDAL,
    kmsService
  });

  const kmsEncryptor = await kmsService.encryptWithKmsKey({
    kmsId: certificateManagerKmsId
  });

  const kmsDecryptor = await kmsService.decryptWithKmsKey({
    kmsId: certificateManagerKmsId
  });

  let accountKey: Buffer | undefined;
  if (acmeCa.credentials) {
    const decryptedCredentials = await kmsDecryptor({
      cipherTextBlob: acmeCa.credentials as Buffer
    });

    const parsedCredentials = await AcmeCertificateAuthorityCredentialsSchema.parseAsync(
      JSON.parse(decryptedCredentials.toString("utf8"))
    );

    accountKey = Buffer.from(parsedCredentials.accountKey, "base64");
  }
  if (!accountKey) {
    accountKey = await acme.crypto.createPrivateRsaKey();
    const newCredentials = {
      accountKey: accountKey.toString("base64")
    };
    const { cipherTextBlob: encryptedNewCredentials } = await kmsEncryptor({
      plainText: Buffer.from(JSON.stringify(newCredentials))
    });
    await externalCertificateAuthorityDAL.update(
      {
        caId: acmeCa.id
      },
      {
        credentials: encryptedNewCredentials
      }
    );
  }

  await blockLocalAndPrivateIpAddresses(acmeCa.configuration.directoryUrl);

  const acmeClientOptions: acme.ClientOptions = {
    directoryUrl: acmeCa.configuration.directoryUrl,
    accountKey
  };

  if (acmeCa.configuration.eabKid && acmeCa.configuration.eabHmacKey) {
    acmeClientOptions.externalAccountBinding = {
      kid: acmeCa.configuration.eabKid,
      hmacKey: acmeCa.configuration.eabHmacKey
    };
  }

  const acmeClient = new acme.Client(acmeClientOptions);

  const appConnection = await appConnectionDAL.findById(acmeCa.configuration.dnsAppConnectionId);
  const connection = await decryptAppConnection(appConnection, kmsService);

  const pem = await acmeClient.auto({
    csr,
    email: acmeCa.configuration.accountEmail,
    challengePriority: ["dns-01"],
    // For ACME development mode, we mock the DNS challenge API calls. So, no real DNS records are created.
    // We need to disable the challenge verification to avoid errors.
    skipChallengeVerification: getConfig().isAcmeDevelopmentMode && getConfig().ACME_SKIP_UPSTREAM_VALIDATION,
    termsOfServiceAgreed: true,

    challengeCreateFn: async (authz, challenge, keyAuthorization) => {
      if (challenge.type !== "dns-01") {
        throw new Error("Unsupported challenge type");
      }

      const { recordName, recordValue } = getAcmeChallengeRecord(
        acmeCa.configuration.dnsProviderConfig.provider,
        authz.identifier.value,
        keyAuthorization
      );

      switch (acmeCa.configuration.dnsProviderConfig.provider) {
        case AcmeDnsProvider.Route53: {
          await route53InsertTxtRecord(
            connection as TAwsConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
          break;
        }
        case AcmeDnsProvider.Cloudflare: {
          await cloudflareInsertTxtRecord(
            connection as TCloudflareConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
          break;
        }
        case AcmeDnsProvider.DNSMadeEasy: {
          await dnsMadeEasyInsertTxtRecord(
            connection as TDNSMadeEasyConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
          break;
        }
        default: {
          throw new Error(`Unsupported DNS provider: ${acmeCa.configuration.dnsProviderConfig.provider as string}`);
        }
      }
    },
    challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
      const { recordName, recordValue } = getAcmeChallengeRecord(
        acmeCa.configuration.dnsProviderConfig.provider,
        authz.identifier.value,
        keyAuthorization
      );

      switch (acmeCa.configuration.dnsProviderConfig.provider) {
        case AcmeDnsProvider.Route53: {
          await route53DeleteTxtRecord(
            connection as TAwsConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
          break;
        }
        case AcmeDnsProvider.Cloudflare: {
          await cloudflareDeleteTxtRecord(
            connection as TCloudflareConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
          break;
        }
        case AcmeDnsProvider.DNSMadeEasy: {
          await dnsMadeEasyDeleteTxtRecord(
            connection as TDNSMadeEasyConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
          break;
        }
        default: {
          throw new Error(`Unsupported DNS provider: ${acmeCa.configuration.dnsProviderConfig.provider as string}`);
        }
      }
    }
  });

  const [leafCert, parentCert] = acme.crypto.splitPemChain(pem);
  const certObj = new x509.X509Certificate(leafCert);

  const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
    plainText: Buffer.from(new Uint8Array(certObj.rawData))
  });

  const certificateChainPem = parentCert.trim();

  const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
    plainText: Buffer.from(certificateChainPem)
  });

  const { cipherTextBlob: encryptedPrivateKey } = csrPrivateKey
    ? await kmsEncryptor({
        plainText: Buffer.from(csrPrivateKey)
      })
    : { cipherTextBlob: undefined };

  return (tx || certificateDAL).transaction(async (innerTx: Knex) => {
    const cert = await certificateDAL.create(
      {
        caId: ca.id,
        pkiSubscriberId: subscriberId,
        status: CertStatus.ACTIVE,
        friendlyName: commonName,
        commonName,
        altNames: altNames?.join(","),
        serialNumber: certObj.serialNumber,
        notBefore: certObj.notBefore,
        notAfter: certObj.notAfter,
        keyUsages,
        extendedKeyUsages,
        projectId: ca.projectId
      },
      innerTx
    );

    await certificateBodyDAL.create(
      {
        certId: cert.id,
        encryptedCertificate,
        encryptedCertificateChain
      },
      innerTx
    );

    if (encryptedPrivateKey !== undefined) {
      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        innerTx
      );
    }

    return cert;
  });
};

export const AcmeCertificateAuthorityFns = ({
  appConnectionDAL,
  appConnectionService,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL,
  pkiSubscriberDAL,
  pkiSyncDAL,
  pkiSyncQueue
}: TAcmeCertificateAuthorityFnsDeps) => {
  const createCertificateAuthority = async ({
    name,
    projectId,
    configuration,
    enableDirectIssuance,
    actor,
    status
  }: {
    status: CaStatus;
    name: string;
    projectId: string;
    configuration: TCreateAcmeCertificateAuthorityDTO["configuration"];
    enableDirectIssuance: boolean;
    actor: OrgServiceActor;
  }) => {
    if (crypto.isFipsModeEnabled()) {
      throw new CryptographyError({
        message: "ACME is currently not supported in FIPS mode of operation."
      });
    }

    const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProviderConfig, eabKid, eabHmacKey } = configuration;
    const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
    }

    if (dnsProviderConfig.provider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
      throw new BadRequestError({
        message: `App connection with ID '${dnsAppConnectionId}' is not an AWS connection`
      });
    }

    if (dnsProviderConfig.provider === AcmeDnsProvider.Cloudflare && appConnection.app !== AppConnection.Cloudflare) {
      throw new BadRequestError({
        message: `App connection with ID '${dnsAppConnectionId}' is not a Cloudflare connection`
      });
    }

    if (dnsProviderConfig.provider === AcmeDnsProvider.DNSMadeEasy && appConnection.app !== AppConnection.DNSMadeEasy) {
      throw new BadRequestError({
        message: `App connection with ID '${dnsAppConnectionId}' is not a DNS Made Easy connection`
      });
    }

    // validates permission to connect
    await appConnectionService.validateAppConnectionUsageById(
      appConnection.app as AppConnection,
      { connectionId: dnsAppConnectionId, projectId },
      actor
    );

    const caEntity = await certificateAuthorityDAL.transaction(async (tx) => {
      try {
        const ca = await certificateAuthorityDAL.create(
          {
            projectId,
            enableDirectIssuance,
            name,
            status
          },
          tx
        );

        await externalCertificateAuthorityDAL.create(
          {
            caId: ca.id,
            dnsAppConnectionId,
            type: CaType.ACME,
            configuration: {
              directoryUrl,
              accountEmail,
              dnsProvider: dnsProviderConfig.provider,
              hostedZoneId: dnsProviderConfig.hostedZoneId,
              eabKid,
              eabHmacKey
            }
          },
          tx
        );

        return await certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
      } catch (error) {
        // @ts-expect-error We're expecting a database error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (error?.error?.code === "23505") {
          throw new BadRequestError({
            message: "Certificate authority with the same name already exists in your project"
          });
        }
        throw error;
      }
    });

    if (!caEntity.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to create external certificate authority" });
    }

    return castDbEntryToAcmeCertificateAuthority(caEntity);
  };

  const updateCertificateAuthority = async ({
    id,
    status,
    configuration,
    enableDirectIssuance,
    actor,
    name
  }: {
    id: string;
    status?: CaStatus;
    configuration: TUpdateAcmeCertificateAuthorityDTO["configuration"];
    enableDirectIssuance?: boolean;
    actor: OrgServiceActor;
    name?: string;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProviderConfig, eabKid, eabHmacKey } = configuration;
        const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

        if (!appConnection) {
          throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
        }

        if (dnsProviderConfig.provider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
          throw new BadRequestError({
            message: `App connection with ID '${dnsAppConnectionId}' is not an AWS connection`
          });
        }

        if (
          dnsProviderConfig.provider === AcmeDnsProvider.Cloudflare &&
          appConnection.app !== AppConnection.Cloudflare
        ) {
          throw new BadRequestError({
            message: `App connection with ID '${dnsAppConnectionId}' is not a Cloudflare connection`
          });
        }

        if (
          dnsProviderConfig.provider === AcmeDnsProvider.DNSMadeEasy &&
          appConnection.app !== AppConnection.DNSMadeEasy
        ) {
          throw new BadRequestError({
            message: `App connection with ID '${dnsAppConnectionId}' is not a DNS Made Easy connection`
          });
        }

        const ca = await certificateAuthorityDAL.findById(id);

        if (!ca) {
          throw new NotFoundError({ message: `Could not find Certificate Authority with ID "${id}"` });
        }

        // validates permission to connect
        await appConnectionService.validateAppConnectionUsageById(
          appConnection.app as AppConnection,
          { connectionId: dnsAppConnectionId, projectId: ca.projectId },
          actor
        );

        await externalCertificateAuthorityDAL.update(
          {
            caId: id,
            type: CaType.ACME
          },
          {
            dnsAppConnectionId,
            configuration: {
              directoryUrl,
              accountEmail,
              dnsProvider: dnsProviderConfig.provider,
              hostedZoneId: dnsProviderConfig.hostedZoneId,
              eabKid,
              eabHmacKey
            }
          },
          tx
        );
      }

      if (name || status || enableDirectIssuance) {
        await certificateAuthorityDAL.updateById(
          id,
          {
            name,
            status,
            enableDirectIssuance
          },
          tx
        );
      }

      return certificateAuthorityDAL.findByIdWithAssociatedCa(id, tx);
    });

    if (!updatedCa.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to update external certificate authority" });
    }

    return castDbEntryToAcmeCertificateAuthority(updatedCa);
  };

  const listCertificateAuthorities = async ({ projectId }: { projectId: string }) => {
    const cas = await certificateAuthorityDAL.findWithAssociatedCa({
      [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
      [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.ACME
    });

    return cas.map(castDbEntryToAcmeCertificateAuthority);
  };

  const orderSubscriberCertificate = async (subscriberId: string) => {
    const subscriber = await pkiSubscriberDAL.findById(subscriberId);
    if (!subscriber.caId) {
      throw new BadRequestError({ message: "Subscriber does not have a CA" });
    }
    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);

    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const [, certificateCsr] = await acme.crypto.createCsr(
      {
        altNames: subscriber.subjectAlternativeNames,
        commonName: subscriber.commonName
      },
      skLeaf
    );

    await orderCertificate(
      {
        caId: subscriber.caId,
        subscriberId: subscriber.id,
        commonName: subscriber.commonName,
        altNames: subscriber.subjectAlternativeNames,
        csr: certificateCsr,
        csrPrivateKey: skLeaf,
        keyUsages: subscriber.keyUsages as CertKeyUsage[],
        extendedKeyUsages: subscriber.extendedKeyUsages as CertExtendedKeyUsage[]
      },
      {
        appConnectionDAL,
        certificateAuthorityDAL,
        externalCertificateAuthorityDAL,
        certificateDAL,
        certificateBodyDAL,
        certificateSecretDAL,
        kmsService,
        projectDAL
      }
    );
    await triggerAutoSyncForSubscriber(subscriber.id, { pkiSyncDAL, pkiSyncQueue });
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderSubscriberCertificate
  };
};
