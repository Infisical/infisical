import { ChangeResourceRecordSetsCommand, Route53Client } from "@aws-sdk/client-route-53";
import * as x509 from "@peculiar/x509";
import acme from "acme-client";

import { TableName } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, CryptographyError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnection, TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
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

type TAcmeCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById" | "findWithAssociatedCa"
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
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
};

type DBConfigurationColumn = {
  dnsProvider: string;
  directoryUrl: string;
  accountEmail: string;
  hostedZoneId: string;
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
      accountEmail: dbConfigurationCol.accountEmail
    },
    status: ca.status as CaStatus
  };
};

export const route53InsertTxtRecord = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const config = await getAwsConnectionConfig(connection, AWSRegion.US_WEST_1); // REGION is irrelevant because Route53 is global
  const route53Client = new Route53Client({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: config.credentials!,
    region: config.region
  });

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: "Set ACME challenge TXT record",
      Changes: [
        {
          Action: "UPSERT",
          ResourceRecordSet: {
            Name: domain,
            Type: "TXT",
            TTL: 30,
            ResourceRecords: [{ Value: value }]
          }
        }
      ]
    }
  });

  await route53Client.send(command);
};

export const route53DeleteTxtRecord = async (
  connection: TAwsConnectionConfig,
  hostedZoneId: string,
  domain: string,
  value: string
) => {
  const config = await getAwsConnectionConfig(connection, AWSRegion.US_WEST_1); // REGION is irrelevant because Route53 is global
  const route53Client = new Route53Client({
    credentials: config.credentials!,
    region: config.region
  });

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: hostedZoneId,
    ChangeBatch: {
      Comment: "Delete ACME challenge TXT record",
      Changes: [
        {
          Action: "DELETE",
          ResourceRecordSet: {
            Name: domain,
            Type: "TXT",
            TTL: 30,
            ResourceRecords: [{ Value: value }]
          }
        }
      ]
    }
  });

  await route53Client.send(command);
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
  pkiSubscriberDAL
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

    const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProviderConfig } = configuration;
    const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
    }

    if (dnsProviderConfig.provider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
      throw new BadRequestError({
        message: `App connection with ID '${dnsAppConnectionId}' is not an AWS connection`
      });
    }

    // validates permission to connect
    await appConnectionService.connectAppConnectionById(appConnection.app as AppConnection, dnsAppConnectionId, actor);

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
              hostedZoneId: dnsProviderConfig.hostedZoneId
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
        const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProviderConfig } = configuration;
        const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

        if (!appConnection) {
          throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
        }

        if (dnsProviderConfig.provider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
          throw new BadRequestError({
            message: `App connection with ID '${dnsAppConnectionId}' is not an AWS connection`
          });
        }

        // validates permission to connect
        await appConnectionService.connectAppConnectionById(
          appConnection.app as AppConnection,
          dnsAppConnectionId,
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
              hostedZoneId: dnsProviderConfig.hostedZoneId
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

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(subscriber.caId);
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

    const acmeClient = new acme.Client({
      directoryUrl: acmeCa.configuration.directoryUrl,
      accountKey
    });

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

    const appConnection = await appConnectionDAL.findById(acmeCa.configuration.dnsAppConnectionId);
    const connection = await decryptAppConnection(appConnection, kmsService);

    const pem = await acmeClient.auto({
      csr: certificateCsr,
      email: acmeCa.configuration.accountEmail,
      challengePriority: ["dns-01"],
      termsOfServiceAgreed: true,

      challengeCreateFn: async (authz, challenge, keyAuthorization) => {
        if (challenge.type !== "dns-01") {
          throw new Error("Unsupported challenge type");
        }

        const recordName = `_acme-challenge.${authz.identifier.value}`; // e.g., "_acme-challenge.example.com"
        const recordValue = `"${keyAuthorization}"`; // must be double quoted

        if (acmeCa.configuration.dnsProviderConfig.provider === AcmeDnsProvider.Route53) {
          await route53InsertTxtRecord(
            connection as TAwsConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
        }
      },
      challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
        const recordName = `_acme-challenge.${authz.identifier.value}`; // e.g., "_acme-challenge.example.com"
        const recordValue = `"${keyAuthorization}"`; // must be double quoted

        if (acmeCa.configuration.dnsProviderConfig.provider === AcmeDnsProvider.Route53) {
          await route53DeleteTxtRecord(
            connection as TAwsConnection,
            acmeCa.configuration.dnsProviderConfig.hostedZoneId,
            recordName,
            recordValue
          );
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

    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(skLeaf)
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          pkiSubscriberId: subscriber.id,
          status: CertStatus.ACTIVE,
          friendlyName: subscriber.commonName,
          commonName: subscriber.commonName,
          altNames: subscriber.subjectAlternativeNames.join(","),
          serialNumber: certObj.serialNumber,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          keyUsages: subscriber.keyUsages as CertKeyUsage[],
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
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderSubscriberCertificate
  };
};
