import net from "node:net";

import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { OrganizationActionScope, OrgMembershipRole, OrgMembershipStatus, TRelays } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
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
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";

import { PamResource } from "../pam-resource/pam-resource-enums";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TRelayDALFactory } from "../relay/relay-dal";
import { TRelayServiceFactory } from "../relay/relay-service";
import { GATEWAY_ACTOR_OID, GATEWAY_ROUTING_INFO_OID, PAM_INFO_OID } from "./gateway-v2-constants";
import { TGatewayV2DALFactory } from "./gateway-v2-dal";
import { TGatewayV2ConnectionDetails } from "./gateway-v2-types";
import { TOrgGatewayConfigV2DALFactory } from "./org-gateway-config-v2-dal";

type TGatewayV2ServiceFactoryDep = {
  orgGatewayConfigV2DAL: Pick<TOrgGatewayConfigV2DALFactory, "findOne" | "create" | "transaction" | "findById">;
  kmsService: TKmsServiceFactory;
  relayService: TRelayServiceFactory;
  gatewayV2DAL: TGatewayV2DALFactory;
  relayDAL: TRelayDALFactory;
  permissionService: TPermissionServiceFactory;
  orgDAL: Pick<TOrgDALFactory, "findOrgMembersByRole">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TGatewayV2ServiceFactory = ReturnType<typeof gatewayV2ServiceFactory>;

export const gatewayV2ServiceFactory = ({
  orgGatewayConfigV2DAL,
  kmsService,
  relayService,
  gatewayV2DAL,
  relayDAL,
  permissionService,
  orgDAL,
  notificationService
}: TGatewayV2ServiceFactoryDep) => {
  const $validateIdentityAccessToGateway = async (orgId: string, actorId: string, actorAuthMethod: ActorAuthMethod) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: ActorType.IDENTITY,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId: orgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );
  };

  const $getOrgCAs = async (orgId: string) => {
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const orgCAs = await orgGatewayConfigV2DAL.transaction(async (tx) => {
      const orgGatewayConfigV2 = await orgGatewayConfigV2DAL.findOne({ orgId });
      if (orgGatewayConfigV2) return orgGatewayConfigV2;

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgGatewayV2Init(orgId)]);

      // generate root CA
      const rootCaKeyAlgorithm = CertKeyAlgorithm.RSA_2048;
      const alg = keyAlgorithmToAlgCfg(rootCaKeyAlgorithm);
      const rootCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

      const rootCaSerialNumber = createSerialNumber();
      const rootCaSkObj = crypto.nativeCrypto.KeyObject.from(rootCaKeys.privateKey);
      const rootCaIssuedAt = new Date();
      const rootCaExpiration = new Date(new Date().setFullYear(2045));

      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `O=${orgId},CN=Infisical Gateway Root CA`,
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
        subject: `O=${orgId},CN=Infisical Gateway Server CA`,
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
        subject: `O=${orgId},CN=Infisical Gateway Client CA`,
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

      const encryptedRootGatewayCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(
          rootCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      }).cipherTextBlob;
      const encryptedRootGatewayCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(rootCaCert.rawData)
      }).cipherTextBlob;

      const encryptedGatewayServerCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(serverCaSkObj.export({ type: "pkcs8", format: "der" }))
      }).cipherTextBlob;
      const encryptedGatewayServerCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(serverCaCert.rawData)
      }).cipherTextBlob;
      const encryptedGatewayServerCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(constructPemChainFromCerts([rootCaCert]))
      }).cipherTextBlob;

      const encryptedGatewayClientCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(clientCaSkObj.export({ type: "pkcs8", format: "der" }))
      }).cipherTextBlob;
      const encryptedGatewayClientCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(clientCaCert.rawData)
      }).cipherTextBlob;
      const encryptedGatewayClientCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(constructPemChainFromCerts([rootCaCert]))
      }).cipherTextBlob;

      return orgGatewayConfigV2DAL.create({
        orgId,
        encryptedRootGatewayCaPrivateKey,
        encryptedRootGatewayCaCertificate,
        encryptedGatewayServerCaPrivateKey,
        encryptedGatewayServerCaCertificate,
        encryptedGatewayServerCaCertificateChain,
        encryptedGatewayClientCaPrivateKey,
        encryptedGatewayClientCaCertificate,
        encryptedGatewayClientCaCertificateChain
      });
    });

    const rootGatewayCaPrivateKey = orgKmsDecryptor({ cipherTextBlob: orgCAs.encryptedRootGatewayCaPrivateKey });
    const rootGatewayCaCertificate = orgKmsDecryptor({ cipherTextBlob: orgCAs.encryptedRootGatewayCaCertificate });

    const gatewayServerCaPrivateKey = orgKmsDecryptor({ cipherTextBlob: orgCAs.encryptedGatewayServerCaPrivateKey });
    const gatewayServerCaCertificate = orgKmsDecryptor({ cipherTextBlob: orgCAs.encryptedGatewayServerCaCertificate });
    const gatewayServerCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedGatewayServerCaCertificateChain
    });

    const gatewayClientCaPrivateKey = orgKmsDecryptor({ cipherTextBlob: orgCAs.encryptedGatewayClientCaPrivateKey });
    const gatewayClientCaCertificate = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedGatewayClientCaCertificate
    });
    const gatewayClientCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgCAs.encryptedGatewayClientCaCertificateChain
    });

    return {
      rootGatewayCaPrivateKey,
      rootGatewayCaCertificate,
      gatewayServerCaPrivateKey,
      gatewayServerCaCertificate,
      gatewayServerCaCertificateChain,
      gatewayClientCaPrivateKey,
      gatewayClientCaCertificate,
      gatewayClientCaCertificateChain
    };
  };

  const listGateways = async ({ orgPermission }: { orgPermission: OrgServiceActor }) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.ListGateways,
      OrgPermissionSubjects.Gateway
    );

    const gateways = await gatewayV2DAL.find({
      orgId: orgPermission.orgId
    });

    return gateways;
  };

  const getPlatformConnectionDetailsByGatewayId = async ({
    gatewayId,
    targetHost,
    targetPort
  }: {
    gatewayId: string;
    targetHost: string;
    targetPort: number;
  }): Promise<TGatewayV2ConnectionDetails | undefined> => {
    const gateway = await gatewayV2DAL.findById(gatewayId);
    if (!gateway) {
      return;
    }

    const orgGatewayConfig = await orgGatewayConfigV2DAL.findOne({ orgId: gateway.orgId });
    if (!orgGatewayConfig) {
      throw new NotFoundError({ message: `Gateway Config for org ${gateway.orgId} not found.` });
    }

    if (!gateway.relayId) {
      throw new BadRequestError({
        message: "Gateway is not associated with a relay"
      });
    }

    const { decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgGatewayConfig.orgId
    });

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);

    const rootGatewayCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedRootGatewayCaCertificate
      })
    );

    const gatewayClientCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedGatewayClientCaCertificate
      })
    );

    const gatewayServerCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedGatewayServerCaCertificate
      })
    );

    const gatewayClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgGatewayConfig.encryptedGatewayClientCaPrivateKey
    });

    const gatewayClientCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: gatewayClientCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const importedGatewayClientCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      gatewayClientCaSkObj.export({ format: "der", type: "pkcs8" }),
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
      GATEWAY_ROUTING_INFO_OID,
      false,
      Buffer.from(JSON.stringify(routingInfo))
    );

    const actorExtension = new x509.Extension(
      GATEWAY_ACTOR_OID,
      false,
      Buffer.from(JSON.stringify({ type: ActorType.PLATFORM }))
    );

    const clientCert = await x509.X509CertificateGenerator.create({
      serialNumber: clientCertSerialNumber,
      subject: `O=${orgGatewayConfig.orgId},OU=gateway-client,CN=${ActorType.PLATFORM}:${gatewayId}`,
      issuer: gatewayClientCaCert.subject,
      notAfter: clientCertExpiration,
      notBefore: clientCertIssuedAt,
      signingKey: importedGatewayClientCaPrivateKey,
      publicKey: clientKeys.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(gatewayClientCaCert, false),
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

    const gatewayClientCertPrivateKey = crypto.nativeCrypto.KeyObject.from(clientKeys.privateKey);

    const relayCredentials = await relayService.getCredentialsForClient({
      relayId: gateway.relayId,
      orgId: gateway.orgId,
      orgName: gateway.orgName,
      gatewayId,
      gatewayName: gateway.name
    });

    return {
      relayHost: relayCredentials.relayHost,
      gateway: {
        clientCertificate: clientCert.toString("pem"),
        clientPrivateKey: gatewayClientCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        serverCertificateChain: constructPemChainFromCerts([gatewayServerCaCert, rootGatewayCaCert])
      },
      relay: {
        clientCertificate: relayCredentials.clientCertificate,
        clientPrivateKey: relayCredentials.clientPrivateKey,
        serverCertificateChain: relayCredentials.serverCertificateChain
      }
    };
  };

  const getPAMConnectionDetails = async ({
    gatewayId,
    sessionId,
    duration,
    resourceType,
    host,
    port,
    actorMetadata
  }: {
    gatewayId: string;
    sessionId: string;
    resourceType: PamResource;
    duration?: number;
    host: string;
    port: number;
    actorMetadata: { id: string; type: ActorType; name: string };
  }) => {
    const gateway = await gatewayV2DAL.findById(gatewayId);
    if (!gateway) {
      return;
    }

    const orgGatewayConfig = await orgGatewayConfigV2DAL.findOne({ orgId: gateway.orgId });
    if (!orgGatewayConfig) {
      throw new NotFoundError({ message: `Gateway Config for org ${gateway.orgId} not found.` });
    }

    if (!gateway.relayId) {
      throw new BadRequestError({
        message: "Gateway is not associated with a relay"
      });
    }

    const { decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: orgGatewayConfig.orgId
    });

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);

    const rootGatewayCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedRootGatewayCaCertificate
      })
    );

    const gatewayClientCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedGatewayClientCaCertificate
      })
    );

    const gatewayServerCaCert = new x509.X509Certificate(
      orgKmsDecryptor({
        cipherTextBlob: orgGatewayConfig.encryptedGatewayServerCaCertificate
      })
    );

    const gatewayClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgGatewayConfig.encryptedGatewayClientCaPrivateKey
    });

    const gatewayClientCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: gatewayClientCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const importedGatewayClientCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      gatewayClientCaSkObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const clientCertIssuedAt = new Date();
    const clientCertExpiration = new Date(new Date().getTime() + (duration ?? 5 * 60 * 1000));
    const clientKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const clientCertSerialNumber = createSerialNumber();

    const routingInfo = {
      targetHost: host,
      targetPort: port
    };

    const routingExtension = new x509.Extension(
      GATEWAY_ROUTING_INFO_OID,
      false,
      Buffer.from(JSON.stringify(routingInfo))
    );

    const pamInfoExtension = new x509.Extension(
      PAM_INFO_OID,
      false,
      Buffer.from(
        JSON.stringify({
          sessionId,
          resourceType
        })
      )
    );

    const actorExtension = new x509.Extension(
      GATEWAY_ACTOR_OID,
      false,
      Buffer.from(JSON.stringify({ type: actorMetadata.type, id: actorMetadata.id, name: actorMetadata.name }))
    );

    const clientCert = await x509.X509CertificateGenerator.create({
      serialNumber: clientCertSerialNumber,
      subject: `O=${orgGatewayConfig.orgId},OU=gateway-client,CN=${actorMetadata.type}:${gatewayId}`,
      issuer: gatewayClientCaCert.subject,
      notAfter: clientCertExpiration,
      notBefore: clientCertIssuedAt,
      signingKey: importedGatewayClientCaPrivateKey,
      publicKey: clientKeys.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(gatewayClientCaCert, false),
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
        actorExtension,
        pamInfoExtension
      ]
    });

    const gatewayClientCertPrivateKey = crypto.nativeCrypto.KeyObject.from(clientKeys.privateKey);

    const relayCredentials = await relayService.getCredentialsForClient({
      relayId: gateway.relayId,
      orgId: gateway.orgId,
      orgName: gateway.orgName,
      gatewayId,
      gatewayName: gateway.name,
      duration
    });

    return {
      relayHost: relayCredentials.relayHost,
      gateway: {
        clientCertificate: clientCert.toString("pem"),
        clientPrivateKey: gatewayClientCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        serverCertificateChain: constructPemChainFromCerts([gatewayServerCaCert, rootGatewayCaCert])
      },
      relay: {
        clientCertificate: relayCredentials.clientCertificate,
        clientPrivateKey: relayCredentials.clientPrivateKey,
        serverCertificateChain: relayCredentials.serverCertificateChain
      }
    };
  };

  const registerGateway = async ({
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
    await $validateIdentityAccessToGateway(orgId, actorId, actorAuthMethod);
    const orgCAs = await $getOrgCAs(orgId);

    let relay: TRelays = await relayDAL.findOne({ orgId, name: relayName });
    if (!relay) {
      relay = await relayDAL.findOne({ name: relayName, orgId: null });
    }

    if (!relay) {
      throw new NotFoundError({ message: `Relay ${relayName} not found` });
    }

    try {
      const [gateway] = await gatewayV2DAL.upsert(
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
      const gatewayServerCaCert = new x509.X509Certificate(orgCAs.gatewayServerCaCertificate);
      const rootGatewayCaCert = new x509.X509Certificate(orgCAs.rootGatewayCaCertificate);
      const gatewayClientCaCert = new x509.X509Certificate(orgCAs.gatewayClientCaCertificate);

      const gatewayServerCaSkObj = crypto.nativeCrypto.createPrivateKey({
        key: orgCAs.gatewayServerCaPrivateKey,
        format: "der",
        type: "pkcs8"
      });
      const gatewayServerCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
        "pkcs8",
        gatewayServerCaSkObj.export({ format: "der", type: "pkcs8" }),
        alg,
        true,
        ["sign"]
      );

      const gatewayServerKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const gatewayServerCertIssuedAt = new Date();
      const gatewayServerCertExpireAt = new Date(new Date().setDate(new Date().getDate() + 1));
      const gatewayServerCertPrivateKey = crypto.nativeCrypto.KeyObject.from(gatewayServerKeys.privateKey);

      const gatewayServerCertExtensions: x509.Extension[] = [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(gatewayServerCaCert, false),
        await x509.SubjectKeyIdentifierExtension.create(gatewayServerKeys.publicKey),
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

      const gatewayServerSerialNumber = createSerialNumber();
      const gatewayServerCertificate = await x509.X509CertificateGenerator.create({
        serialNumber: gatewayServerSerialNumber,
        subject: `O=${orgId},CN=Gateway`,
        issuer: gatewayServerCaCert.subject,
        notBefore: gatewayServerCertIssuedAt,
        notAfter: gatewayServerCertExpireAt,
        signingKey: gatewayServerCaPrivateKey,
        publicKey: gatewayServerKeys.publicKey,
        signingAlgorithm: alg,
        extensions: gatewayServerCertExtensions
      });

      const relayCredentials = await relayService.getCredentialsForGateway({
        relayName,
        orgId,
        gatewayId: gateway.id,
        gatewayName: gateway.name
      });

      return {
        gatewayId: gateway.id,
        relayHost: relayCredentials.relayHost,
        pki: {
          serverCertificate: gatewayServerCertificate.toString("pem"),
          serverPrivateKey: gatewayServerCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
          clientCertificateChain: constructPemChainFromCerts([gatewayClientCaCert, rootGatewayCaCert])
        },
        ssh: {
          clientCertificate: relayCredentials.clientSshCert,
          clientPrivateKey: relayCredentials.clientSshPrivateKey,
          serverCAPublicKey: relayCredentials.serverCAPublicKey
        }
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({ message: `Gateway with name "${name}" already exists` });
      }

      throw err;
    }
  };

  const heartbeat = async ({ orgPermission }: { orgPermission: OrgServiceActor }) => {
    await $validateIdentityAccessToGateway(orgPermission.orgId, orgPermission.id, orgPermission.authMethod);

    const gateway = await gatewayV2DAL.findOne({
      orgId: orgPermission.orgId,
      identityId: orgPermission.id
    });

    if (!gateway) {
      throw new NotFoundError({ message: `Gateway for identity ${orgPermission.id} not found.` });
    }

    const gatewayV2ConnectionDetails = await getPlatformConnectionDetailsByGatewayId({
      gatewayId: gateway.id,
      targetHost: "health-check",
      targetPort: 443
    });

    if (!gatewayV2ConnectionDetails) {
      throw new NotFoundError({ message: `Gateway connection details for gateway ${gateway.id} not found.` });
    }

    const isGatewayReachable = await withGatewayV2Proxy(
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
        relayHost: gatewayV2ConnectionDetails.relayHost,
        gateway: gatewayV2ConnectionDetails.gateway,
        relay: gatewayV2ConnectionDetails.relay
      }
    );

    if (!isGatewayReachable) {
      throw new BadRequestError({ message: `Gateway ${gateway.id} is not reachable` });
    }

    await gatewayV2DAL.updateById(gateway.id, { heartbeat: new Date() });
  };

  const deleteGatewayById = async ({ orgPermission, id }: { orgPermission: OrgServiceActor; id: string }) => {
    const gateway = await gatewayV2DAL.findOne({ id, orgId: orgPermission.orgId });
    if (!gateway) {
      throw new NotFoundError({ message: `Gateway ${id} not found` });
    }

    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: gateway.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.DeleteGateways,
      OrgPermissionSubjects.Gateway
    );

    try {
      return await gatewayV2DAL.deleteById(gateway.id);
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code: string })?.code === DatabaseErrorCode.ForeignKeyViolation
      ) {
        throw new BadRequestError({
          message: "Failed to delete gateway because it is attached to active resources"
        });
      }

      throw err;
    }
  };

  const getPamSessionKey = async ({ orgPermission }: { orgPermission: OrgServiceActor }) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: orgPermission.type,
      actorId: orgPermission.id,
      orgId: orgPermission.orgId,
      actorAuthMethod: orgPermission.authMethod,
      actorOrgId: orgPermission.orgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionGatewayActions.CreateGateways,
      OrgPermissionSubjects.Gateway
    );

    return gatewayV2DAL.transaction(async (tx) => {
      const gateway = await gatewayV2DAL.findOne(
        {
          identityId: orgPermission.id
        },
        tx
      );

      if (!gateway) {
        throw new NotFoundError({ message: "Gateway not found" });
      }

      const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: orgPermission.orgId
      });

      if (gateway.encryptedPamSessionKey) {
        return decryptor({ cipherTextBlob: gateway.encryptedPamSessionKey });
      }

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.GatewayPamSessionKey(gateway.id)]);

      const newPamSessionKey = crypto.randomBytes(32);
      const { cipherTextBlob: encryptedPamSessionKey } = encryptor({ plainText: newPamSessionKey });

      await gatewayV2DAL.updateById(gateway.id, { encryptedPamSessionKey }, tx);

      return newPamSessionKey;
    });
  };

  const healthcheckNotify = async () => {
    const unhealthyGateways = await gatewayV2DAL.find({
      isHeartbeatStale: true
    });

    if (unhealthyGateways.length === 0) return;

    logger.warn(
      { gatewayIds: unhealthyGateways.map((g) => g.id) },
      "Found gateways with last heartbeat over an hour ago. Sending notifications."
    );

    const gatewaysByOrg = groupBy(unhealthyGateways, (gw) => gw.orgId);

    for await (const [orgId, gateways] of Object.entries(gatewaysByOrg)) {
      try {
        const admins = (await orgDAL.findOrgMembersByRole(orgId, OrgMembershipRole.Admin)).filter(
          (admin) => admin.status !== OrgMembershipStatus.Invited
        );
        if (admins.length === 0) {
          logger.warn({ orgId }, "Organization has no admins to notify about unhealthy gateway.");
          // eslint-disable-next-line no-continue
          continue;
        }

        const gatewayNames = gateways.map((g) => `"${g.name}"`).join(", ");
        const body = `The following gateway(s) in your organization may be offline as they haven't reported a heartbeat in over an hour: ${gatewayNames}. Please check their status.`;

        await notificationService.createUserNotifications(
          admins.map((admin) => ({
            userId: admin.user.id,
            orgId,
            type: NotificationType.GATEWAY_HEALTH_ALERT,
            title: "Gateway Health Alert",
            body,
            link: "/organization/networking"
          }))
        );

        // Temporarily disabled email notifications due to excessive noise. Will be revised later
        //
        // await smtpService.sendMail({
        //   recipients: admins.map((admin) => admin.user.email).filter((v): v is string => !!v),
        //   subjectLine: "Gateway Health Alert",
        //   substitutions: {
        //     type: "gateway",
        //     names: gatewayNames
        //   },
        //   template: SmtpTemplates.HealthAlert
        // });

        await Promise.all(gateways.map((gw) => gatewayV2DAL.updateById(gw.id, { healthAlertedAt: new Date() })));
      } catch (error) {
        logger.error(error, `Failed to send gateway health notifications for organization [orgId=${orgId}]`);
      }
    }
  };

  return {
    listGateways,
    registerGateway,
    getPlatformConnectionDetailsByGatewayId,
    getPAMConnectionDetails,
    deleteGatewayById,
    heartbeat,
    getPamSessionKey,
    healthcheckNotify
  };
};
