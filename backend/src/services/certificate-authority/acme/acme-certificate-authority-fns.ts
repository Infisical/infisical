import { ChangeResourceRecordSetsCommand, Route53Client } from "@aws-sdk/client-route-53";
import * as x509 from "@peculiar/x509";
import acme from "acme-client";
import { KeyObject } from "crypto";

import { TableName, TPkiSubscribers } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
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
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TCertificateAuthority } from "../certificate-authority-types";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import { AcmeDnsProvider } from "./acme-certificate-authority-enums";
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
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
};

type DBConfigurationColumn = {
  dnsProvider: string;
  directoryUrl: string;
  accountEmail: string;
};

export const castDbEntryToAcmeCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TAcmeCertificateAuthority => {
  if (!ca.externalCa) {
    throw new BadRequestError({ message: "Malformed ACME certificate authority" });
  }

  const dbConfigurationCol = ca.externalCa.configuration as DBConfigurationColumn;

  return {
    id: ca.id,
    type: CaType.ACME,
    disableDirectIssuance: ca.disableDirectIssuance,
    name: ca.externalCa.name,
    projectId: ca.projectId,
    configuration: {
      dnsAppConnectionId: ca.externalCa.dnsAppConnectionId as string,
      dnsProvider: dbConfigurationCol.dnsProvider as AcmeDnsProvider,
      directoryUrl: dbConfigurationCol.directoryUrl,
      accountEmail: dbConfigurationCol.accountEmail
    },
    status: ca.externalCa.status as CaStatus
  };
};

export const route53InsertTxtRecord = async (connection: TAwsConnectionConfig, domain: string, value: string) => {
  const config = await getAwsConnectionConfig(connection, AWSRegion.US_WEST_1); // REGION is irrelevant because Route53 is global
  const route53Client = new Route53Client({
    credentials: config.credentials!,
    region: config.region
  });

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: "Z040441124N1GOOMCQYX1", // SHEEN TODO: Get this from user input
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

export const route53DeleteTxtRecord = async (connection: TAwsConnectionConfig, domain: string, value: string) => {
  const config = await getAwsConnectionConfig(connection, AWSRegion.US_WEST_1); // REGION is irrelevant because Route53 is global
  const route53Client = new Route53Client({
    credentials: config.credentials!,
    region: config.region
  });

  const command = new ChangeResourceRecordSetsCommand({
    HostedZoneId: "Z040441124N1GOOMCQYX1", // SHEEN TODO: same here
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
  projectDAL
}: TAcmeCertificateAuthorityFnsDeps) => {
  const createCertificateAuthority = async ({
    name,
    projectId,
    configuration,
    disableDirectIssuance,
    actor,
    status
  }: {
    status: CaStatus;
    name: string;
    projectId: string;
    configuration: TCreateAcmeCertificateAuthorityDTO["configuration"];
    disableDirectIssuance: boolean;
    actor: OrgServiceActor;
  }) => {
    const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProvider } = configuration;
    const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
    }

    if (dnsProvider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
      throw new BadRequestError({
        message: `App connection with ID '${dnsAppConnectionId}' is not an AWS connection`
      });
    }

    // validates permission to connect
    await appConnectionService.connectAppConnectionById(appConnection.app as AppConnection, dnsAppConnectionId, actor);

    const caEntity = await certificateAuthorityDAL.transaction(async (tx) => {
      const ca = await certificateAuthorityDAL.create(
        {
          projectId,
          disableDirectIssuance
        },
        tx
      );

      await externalCertificateAuthorityDAL.create(
        {
          certificateAuthorityId: ca.id,
          dnsAppConnectionId,
          type: CaType.ACME,
          name,
          configuration: {
            directoryUrl,
            accountEmail,
            dnsProvider
          },
          status
        },
        tx
      );

      return certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
    });

    if (!caEntity.externalCa) {
      throw new BadRequestError({ message: "Failed to create external certificate authority" });
    }

    return {
      id: caEntity.id,
      type: CaType.ACME,
      disableDirectIssuance: caEntity.disableDirectIssuance,
      name: caEntity.externalCa.name,
      projectId,
      status,
      configuration: caEntity.externalCa.configuration
    } as TCertificateAuthority;
  };

  const updateCertificateAuthority = async ({
    id,
    status,
    configuration,
    disableDirectIssuance,
    actor
  }: {
    id: string;
    status?: CaStatus;
    configuration: TUpdateAcmeCertificateAuthorityDTO["configuration"];
    disableDirectIssuance?: boolean;
    actor: OrgServiceActor;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { dnsAppConnectionId, directoryUrl, accountEmail, dnsProvider } = configuration;
        const appConnection = await appConnectionDAL.findById(dnsAppConnectionId);

        if (!appConnection) {
          throw new NotFoundError({ message: `App connection with ID '${dnsAppConnectionId}' not found` });
        }

        if (dnsProvider === AcmeDnsProvider.Route53 && appConnection.app !== AppConnection.AWS) {
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
            certificateAuthorityId: id,
            type: CaType.ACME
          },
          {
            configuration: { directoryUrl, accountEmail, dnsProvider, dnsAppConnectionId }
          },
          tx
        );
      }

      if (status) {
        await externalCertificateAuthorityDAL.update(
          {
            certificateAuthorityId: id,
            type: CaType.ACME
          },
          {
            status
          },
          tx
        );
      }

      if (disableDirectIssuance !== undefined) {
        await certificateAuthorityDAL.updateById(
          id,
          {
            disableDirectIssuance
          },
          tx
        );
      }

      return certificateAuthorityDAL.findByIdWithAssociatedCa(id, tx);
    });

    if (!updatedCa.externalCa) {
      throw new BadRequestError({ message: "Failed to update external certificate authority" });
    }

    return {
      id: updatedCa.id,
      type: CaType.ACME,
      disableDirectIssuance: updatedCa.disableDirectIssuance,
      name: updatedCa.externalCa.name,
      projectId: updatedCa.projectId,
      status: updatedCa.externalCa.status,
      configuration: updatedCa.externalCa.configuration
    };
  };

  const listCertificateAuthorities = async ({ projectId }: { projectId: string }) => {
    const cas = await certificateAuthorityDAL.findWithAssociatedCa({
      [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
      [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.ACME
    });

    return cas.map(castDbEntryToAcmeCertificateAuthority);
  };

  // SHEEN TODO: need to execute this from a job
  const orderCertificate = async (
    subscriber: TPkiSubscribers,
    ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>,
    actor: OrgServiceActor
  ) => {
    const acmeCa = castDbEntryToAcmeCertificateAuthority(ca);

    // SHEEN TODO: need to save this in credentials field and reuse
    const privateRsaKey = await acme.crypto.createPrivateRsaKey();

    const acmeClient = new acme.Client({
      directoryUrl: acmeCa.configuration.directoryUrl,
      accountKey: privateRsaKey
    });

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const leafKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const skLeafObj = KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const [, certificateCsr] = await acme.crypto.createCsr(
      {
        altNames: subscriber.subjectAlternativeNames,
        commonName: subscriber.commonName
      },
      skLeaf
    );

    // SHEEN TODO: need to update this to remove dependence on ACTOR
    const appConnection = await appConnectionDAL.findById(acmeCa.configuration.dnsAppConnectionId);
    const connection = await appConnectionService.connectAppConnectionById(
      appConnection.app as AppConnection,
      acmeCa.configuration.dnsAppConnectionId,
      actor
    );

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

        if (acmeCa.configuration.dnsProvider === AcmeDnsProvider.Route53) {
          await route53InsertTxtRecord(connection as TAwsConnection, recordName, recordValue);
        }
      },
      challengeRemoveFn: async (authz, challenge, keyAuthorization) => {
        const recordName = `_acme-challenge.${authz.identifier.value}`; // e.g., "_acme-challenge.example.com"
        const recordValue = `"${keyAuthorization}"`; // must be double quoted

        if (acmeCa.configuration.dnsProvider === AcmeDnsProvider.Route53) {
          await route53DeleteTxtRecord(connection as TAwsConnection, recordName, recordValue);
        }
      }
    });

    console.log("PEM IS", pem);

    const [leafCert, parentCert] = acme.crypto.splitPemChain(pem);
    const certObj = new x509.X509Certificate(leafCert);

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
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
          caCertId: "s" // SHEEN TODO: merge Andrey's PR and then remove this
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
    orderCertificate
  };
};
