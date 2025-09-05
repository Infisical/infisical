import net from "node:net";

import * as x509 from "@peculiar/x509";

import { TRelays } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { withConnectorProxy } from "@app/lib/connector/connector";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { OrgServiceActor } from "@app/lib/types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { constructPemChainFromCerts } from "@app/services/certificate/certificate-fns";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TLicenseServiceFactory } from "../license/license-service";
import {
  OrgPermissionConnectorActions,
  OrgPermissionGatewayActions,
  OrgPermissionSubjects
} from "../permission/org-permission";
import { throwUnlessCanAny } from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TRelayDALFactory } from "../relay/relay-dal";
import { isInstanceRelay } from "../relay/relay-fns";
import { TRelayServiceFactory } from "../relay/relay-service";
import { CONNECTOR_ACTOR_OID, CONNECTOR_ROUTING_INFO_OID } from "./connector-constants";
import { TConnectorDALFactory } from "./connector-dal";
import { TOrgConnectorConfigDALFactory } from "./org-connector-config-dal";

type TConnectorServiceFactoryDep = {
  orgConnectorConfigDAL: Pick<TOrgConnectorConfigDALFactory, "findOne" | "create" | "transaction" | "findById">;
  licenseService: Pick<TLicenseServiceFactory, "onPremFeatures" | "getPlan">;
  kmsService: TKmsServiceFactory;
  relayService: TRelayServiceFactory;
  connectorDAL: TConnectorDALFactory;
  relayDAL: TRelayDALFactory;
  permissionService: TPermissionServiceFactory;
};

export type TConnectorServiceFactory = ReturnType<typeof connectorServiceFactory>;

export const connectorServiceFactory = ({
  orgConnectorConfigDAL,
  licenseService,
  kmsService,
  relayService,
  connectorDAL,
  relayDAL,
  permissionService
}: TConnectorServiceFactoryDep) => {
  const $validateIdentityAccessToConnector = async (
    orgId: string,
    actorId: string,
    actorAuthMethod: ActorAuthMethod
  ) => {
    const orgLicensePlan = await licenseService.getPlan(orgId);
    if (!orgLicensePlan.gateway) {
      throw new BadRequestError({
        message:
          "Connector operation failed due to organization plan restrictions. Please upgrade your instance to Infisical's Enterprise plan."
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      actorId,
      orgId,
      actorAuthMethod,
      orgId
    );

    throwUnlessCanAny(permission, [
      { action: OrgPermissionConnectorActions.CreateConnectors, subject: OrgPermissionSubjects.Connector },
      { action: OrgPermissionGatewayActions.CreateGateways, subject: OrgPermissionSubjects.Gateway }
    ]);
  };

  const $getOrgCAs = async (orgId: string) => {
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const orgCAs = await orgConnectorConfigDAL.transaction(async (tx) => {
      const orgConnectorConfig = await orgConnectorConfigDAL.findOne({ orgId });
      if (orgConnectorConfig) return orgConnectorConfig;

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgConnectorInit(orgId)]);

      // generate root CA
      const rootCaKeyAlgorithm = CertKeyAlgorithm.RSA_2048;
      const alg = keyAlgorithmToAlgCfg(rootCaKeyAlgorithm);
      const rootCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

      const rootCaSerialNumber = createSerialNumber();
      const rootCaSkObj = crypto.nativeCrypto.KeyObject.from(rootCaKeys.privateKey);
      const rootCaIssuedAt = new Date();
      const rootCaExpiration = new Date(new Date().setFullYear(2045));

      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `O=${orgId},CN=Infisical Connector Root CA`,
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

      // generate server CA
      const serverCaSerialNumber = createSerialNumber();
      const serverCaIssuedAt = new Date();
      const serverCaExpiration = new Date(new Date().setFullYear(2045));
      const serverCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const serverCaSkObj = crypto.nativeCrypto.KeyObject.from(serverCaKeys.privateKey);
      const serverCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: serverCaSerialNumber,
        subject: `O=${orgId},CN=Infisical Connector Server CA`,
        issuer: rootCaCert.subject,
        notBefore: serverCaIssuedAt,
        notAfter: serverCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: serverCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(serverCaKeys.publicKey)
        ]
      });

      // generate client CA
      const clientCaSerialNumber = createSerialNumber();
      const clientCaIssuedAt = new Date();
      const clientCaExpiration = new Date(new Date().setFullYear(2045));
      const clientCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const clientCaSkObj = crypto.nativeCrypto.KeyObject.from(clientCaKeys.privateKey);
      const clientCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: clientCaSerialNumber,
        subject: `O=${orgId},CN=Infisical Connector Client CA`,
        issuer: rootCaCert.subject,
        notBefore: clientCaIssuedAt,
        notAfter: clientCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: clientCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(clientCaKeys.publicKey)
        ]
      });

      const encryptedRootConnectorCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(
          rootCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      }).cipherTextBlob;
      const encryptedRootConnectorCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(rootCaCert.rawData)
      }).cipherTextBlob;

      const encryptedConnectorServerCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(serverCaSkObj.export({ type: "pkcs8", format: "der" }))
      }).cipherTextBlob;
      const encryptedConnectorServerCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(serverCaCert.rawData)
      }).cipherTextBlob;
      const encryptedConnectorServerCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(constructPemChainFromCerts([rootCaCert]))
      }).cipherTextBlob;

      const encryptedConnectorClientCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(clientCaSkObj.export({ type: "pkcs8", format: "der" }))
      }).cipherTextBlob;
      const encryptedConnectorClientCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(clientCaCert.rawData)
      }).cipherTextBlob;
      const encryptedConnectorClientCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(constructPemChainFromCerts([rootCaCert]))
      }).cipherTextBlob;

      return orgConnectorConfigDAL.create({
        orgId,
        encryptedRootConnectorCaPrivateKey,
        encryptedRootConnectorCaCertificate,
        encryptedConnectorServerCaPrivateKey,
        encryptedConnectorServerCaCertificate,
        encryptedConnectorServerCaCertificateChain,
        encryptedConnectorClientCaPrivateKey,
        encryptedConnectorClientCaCertificate,
        encryptedConnectorClientCaCertificateChain
      });
    });

    const rootConnectorCaPrivateKey = orgKmsDecryptor({ cipherTextBlob: orgCAs.encryptedRootConnectorCaPrivateKey });
    const rootConnectorCaCertificate = orgKmsDecryptor({ cipherTextBlob: orgCAs.encryptedRootConnectorCaCertificate });

    const connectorServerCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedConnectorServerCaPrivateKey
    });
    const connectorServerCaCertificate = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedConnectorServerCaCertificate
    });
    const connectorServerCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedConnectorServerCaCertificateChain
    });

    const connectorClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedConnectorClientCaPrivateKey
    });
    const connectorClientCaCertificate = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedConnectorClientCaCertificate
    });
    const connectorClientCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedConnectorClientCaCertificateChain
    });

    return {
      rootConnectorCaPrivateKey,
      rootConnectorCaCertificate,
      connectorServerCaPrivateKey,
      connectorServerCaCertificate,
      connectorServerCaCertificateChain,
      connectorClientCaPrivateKey,
      connectorClientCaCertificate,
      connectorClientCaCertificateChain
    };
  };

  const listConnectors = async ({ orgPermission }: { orgPermission: OrgServiceActor }) => {
    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      orgPermission.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );

    throwUnlessCanAny(permission, [
      { action: OrgPermissionConnectorActions.ListConnectors, subject: OrgPermissionSubjects.Connector },
      { action: OrgPermissionGatewayActions.ListGateways, subject: OrgPermissionSubjects.Gateway }
    ]);

    const connectors = await connectorDAL.find({
      orgId: orgPermission.orgId
    });

    return connectors;
  };

  const getPlatformConnectionDetailsByConnectorId = async ({
    connectorId,
    targetHost,
    targetPort
  }: {
    connectorId: string;
    targetHost: string;
    targetPort: number;
  }) => {
    const connector = await connectorDAL.findById(connectorId);
    if (!connector) {
      return;
    }

    const orgConnectorConfig = await orgConnectorConfigDAL.findOne({ orgId: connector.orgId });
    if (!orgConnectorConfig) {
      throw new NotFoundError({ message: `Connector Config for org ${connector.orgId} not found.` });
    }

    if (!connector.relayId) {
      throw new BadRequestError({
        message: "Connector is not associated with a relay"
      });
    }

    const orgLicensePlan = await licenseService.getPlan(orgConnectorConfig.orgId);
    if (!orgLicensePlan.gateway) {
      throw new BadRequestError({
        message: "Please upgrade your instance to Infisical's Enterprise plan to use connectors."
      });
    }

    const { decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgConnectorConfig.orgId
    });

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);

    const rootConnectorCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgConnectorConfig.encryptedRootConnectorCaCertificate
      })
    );

    const connectorClientCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgConnectorConfig.encryptedConnectorClientCaCertificate
      })
    );

    const connectorServerCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgConnectorConfig.encryptedConnectorServerCaCertificate
      })
    );

    const connectorClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgConnectorConfig.encryptedConnectorClientCaPrivateKey
    });

    const connectorClientCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: connectorClientCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const importedConnectorClientCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      connectorClientCaSkObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const clientCertIssuedAt = new Date();
    const clientCertExpiration = new Date(new Date().getTime() + 5 * 60 * 1000);
    const clientKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const clientCertSerialNumber = createSerialNumber();

    const routingInfo = {
      targetHost,
      targetPort
    };

    const routingExtension = new x509.Extension(
      CONNECTOR_ROUTING_INFO_OID,
      false,
      Buffer.from(JSON.stringify(routingInfo))
    );

    const actorExtension = new x509.Extension(
      CONNECTOR_ACTOR_OID,
      false,
      Buffer.from(JSON.stringify({ type: ActorType.PLATFORM }))
    );

    const clientCert = await x509.X509CertificateGenerator.create({
      serialNumber: clientCertSerialNumber,
      subject: `O=${orgConnectorConfig.orgId},OU=connector-client,CN=${ActorType.PLATFORM}:${connectorId}`,
      issuer: connectorClientCaCert.subject,
      notAfter: clientCertExpiration,
      notBefore: clientCertIssuedAt,
      signingKey: importedConnectorClientCaPrivateKey,
      publicKey: clientKeys.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(connectorClientCaCert, false),
        await x509.SubjectKeyIdentifierExtension.create(clientKeys.publicKey),
        new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_AGREEMENT],
          true
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.CLIENT_AUTH]], true),
        routingExtension,
        actorExtension
      ]
    });

    const connectorClientCertPrivateKey = crypto.nativeCrypto.KeyObject.from(clientKeys.privateKey);

    const relayCredentials = await relayService.getCredentialsForClient({
      relayId: connector.relayId,
      orgId: connector.orgId,
      connectorId
    });

    return {
      relayIp: relayCredentials.relayIp,
      connector: {
        clientCertificate: clientCert.toString("pem"),
        clientPrivateKey: connectorClientCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        serverCertificateChain: constructPemChainFromCerts([connectorServerCaCert, rootConnectorCaCert])
      },
      relay: {
        clientCertificate: relayCredentials.clientCertificate,
        clientPrivateKey: relayCredentials.clientPrivateKey,
        serverCertificateChain: relayCredentials.serverCertificateChain
      }
    };
  };

  const registerConnector = async ({
    orgId,
    actorId,
    actorAuthMethod,
    relayName,
    name
  }: {
    orgId: string;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    relayName: string;
    name: string;
  }) => {
    await $validateIdentityAccessToConnector(orgId, actorId, actorAuthMethod);
    const orgCAs = await $getOrgCAs(orgId);

    let relay: TRelays;
    if (isInstanceRelay(relayName)) {
      relay = await relayDAL.findOne({ name: relayName });
    } else {
      relay = await relayDAL.findOne({ orgId, name: relayName });
    }

    if (!relay) {
      throw new NotFoundError({ message: `Relay ${relayName} not found` });
    }

    try {
      const [connector] = await connectorDAL.upsert(
        [
          {
            orgId,
            name,
            identityId: actorId,
            relayId: relay.id
          }
        ],
        ["identityId"]
      );

      const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
      const connectorServerCaCert = new x509.X509Certificate(orgCAs.connectorServerCaCertificate);
      const rootConnectorCaCert = new x509.X509Certificate(orgCAs.rootConnectorCaCertificate);
      const connectorClientCaCert = new x509.X509Certificate(orgCAs.connectorClientCaCertificate);

      const connectorServerCaSkObj = crypto.nativeCrypto.createPrivateKey({
        key: orgCAs.connectorServerCaPrivateKey,
        format: "der",
        type: "pkcs8"
      });
      const connectorServerCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
        "pkcs8",
        connectorServerCaSkObj.export({ format: "der", type: "pkcs8" }),
        alg,
        true,
        ["sign"]
      );

      const connectorServerKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const connectorServerCertIssuedAt = new Date();
      const connectorServerCertExpireAt = new Date(new Date().setMonth(new Date().getMonth() + 1));
      const connectorServerCertPrivateKey = crypto.nativeCrypto.KeyObject.from(connectorServerKeys.privateKey);

      const connectorServerCertExtensions: x509.Extension[] = [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(connectorServerCaCert, false),
        await x509.SubjectKeyIdentifierExtension.create(connectorServerKeys.publicKey),
        new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
          true
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true),
        new x509.SubjectAlternativeNameExtension([
          { type: "dns", value: "localhost" },
          { type: "ip", value: "127.0.0.1" },
          { type: "ip", value: "::1" }
        ])
      ];

      const connectorServerSerialNumber = createSerialNumber();
      const connectorServerCertificate = await x509.X509CertificateGenerator.create({
        serialNumber: connectorServerSerialNumber,
        subject: `O=${orgId},CN=Connector`,
        issuer: connectorServerCaCert.subject,
        notBefore: connectorServerCertIssuedAt,
        notAfter: connectorServerCertExpireAt,
        signingKey: connectorServerCaPrivateKey,
        publicKey: connectorServerKeys.publicKey,
        signingAlgorithm: alg,
        extensions: connectorServerCertExtensions
      });

      const relayCredentials = await relayService.getCredentialsForConnector({
        relayName,
        orgId,
        connectorId: connector.id
      });

      return {
        connectorId: connector.id,
        relayIp: relayCredentials.relayIp,
        pki: {
          serverCertificate: connectorServerCertificate.toString("pem"),
          serverPrivateKey: connectorServerCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
          clientCertificateChain: constructPemChainFromCerts([connectorClientCaCert, rootConnectorCaCert])
        },
        ssh: {
          clientCertificate: relayCredentials.clientSshCert,
          clientPrivateKey: relayCredentials.clientSshPrivateKey,
          serverCAPublicKey: relayCredentials.serverCAPublicKey
        }
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `Connector with name "${name}" already exists` });
      }

      throw err;
    }
  };

  const heartbeat = async ({ orgPermission }: { orgPermission: OrgServiceActor }) => {
    await $validateIdentityAccessToConnector(orgPermission.orgId, orgPermission.id, orgPermission.authMethod);

    const connector = await connectorDAL.findOne({
      orgId: orgPermission.orgId,
      identityId: orgPermission.id
    });

    if (!connector) {
      throw new NotFoundError({ message: `Connector for identity ${orgPermission.id} not found.` });
    }

    const connectorConnectionDetails = await getPlatformConnectionDetailsByConnectorId({
      connectorId: connector.id,
      targetHost: "health-check",
      targetPort: 443
    });

    if (!connectorConnectionDetails) {
      throw new NotFoundError({ message: `Connector connection details for connector ${connector.id} not found.` });
    }

    const isConnectorReachable = await withConnectorProxy(
      async (port) => {
        return new Promise<boolean>((resolve, reject) => {
          const socket = new net.Socket();
          let responseReceived = false;
          let isResolved = false;

          // Set socket timeout
          socket.setTimeout(10000);

          const cleanup = () => {
            if (!socket.destroyed) {
              socket.destroy();
            }
          };

          socket.on("data", (data: Buffer) => {
            const response = data.toString().trim();
            if (response === "PONG" && !isResolved) {
              isResolved = true;
              responseReceived = true;
              cleanup();
              resolve(true);
            }
          });

          socket.on("error", (err: Error) => {
            if (!isResolved) {
              isResolved = true;
              cleanup();
              reject(new Error(`TCP connection error: ${err.message}`));
            }
          });

          socket.on("timeout", () => {
            if (!isResolved) {
              isResolved = true;
              cleanup();
              reject(new Error("TCP connection timeout"));
            }
          });

          socket.on("close", () => {
            if (!isResolved && !responseReceived) {
              isResolved = true;
              cleanup();
              reject(new Error("Connection closed without receiving PONG"));
            }
          });

          socket.connect(port, "localhost");
        });
      },
      {
        protocol: GatewayProxyProtocol.Ping,
        relayIp: connectorConnectionDetails.relayIp,
        connector: connectorConnectionDetails.connector,
        relay: connectorConnectionDetails.relay
      }
    );

    if (!isConnectorReachable) {
      throw new BadRequestError({ message: `Connector ${connector.id} is not reachable` });
    }

    await connectorDAL.updateById(connector.id, { heartbeat: new Date() });
  };

  const deleteConnectorById = async ({ orgPermission, id }: { orgPermission: OrgServiceActor; id: string }) => {
    const connector = await connectorDAL.findOne({ id, orgId: orgPermission.orgId });
    if (!connector) {
      throw new NotFoundError({ message: `Connector ${id} not found` });
    }

    const { permission } = await permissionService.getOrgPermission(
      orgPermission.type,
      orgPermission.id,
      connector.orgId,
      orgPermission.authMethod,
      orgPermission.orgId
    );

    throwUnlessCanAny(permission, [
      { action: OrgPermissionConnectorActions.DeleteConnectors, subject: OrgPermissionSubjects.Connector },
      { action: OrgPermissionGatewayActions.DeleteGateways, subject: OrgPermissionSubjects.Gateway }
    ]);

    return connectorDAL.deleteById(connector.id);
  };

  return {
    listConnectors,
    registerConnector,
    getPlatformConnectionDetailsByConnectorId,
    deleteConnectorById,
    heartbeat
  };
};
