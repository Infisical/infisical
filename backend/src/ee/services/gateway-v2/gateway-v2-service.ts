import * as x509 from "@peculiar/x509";

import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { constructPemChainFromCerts } from "@app/services/certificate/certificate-fns";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { TProxyServiceFactory } from "../proxy/proxy-service";
import { TOrgGatewayConfigV2DALFactory } from "./org-gateway-config-v2-dal";

type TGatewayV2ServiceFactoryDep = {
  orgGatewayConfigV2DAL: Pick<TOrgGatewayConfigV2DALFactory, "findOne" | "create" | "transaction" | "findById">;
  kmsService: TKmsServiceFactory;
  proxyService: TProxyServiceFactory;
};

export type TGatewayV2ServiceFactory = ReturnType<typeof gatewayV2ServiceFactory>;

export const gatewayV2ServiceFactory = ({
  orgGatewayConfigV2DAL,
  kmsService,
  proxyService
}: TGatewayV2ServiceFactoryDep) => {
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

  const registerGateway = async ({ orgId, proxyName }: { orgId: string; actorId: string; proxyName: string }) => {
    const orgCAs = await $getOrgCAs(orgId);

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const gatewayServerCaCert = new x509.X509Certificate(orgCAs.gatewayServerCaCertificate);
    const rootGatewayCaCert = new x509.X509Certificate(orgCAs.rootGatewayCaCertificate);

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
    const gatewayServerCertExpireAt = new Date(new Date().setMonth(new Date().getMonth() + 1));
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
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true)
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

    const proxyCredentials = await proxyService.generateSshCredentialsForGateway({
      proxyName,
      orgId
    });

    return {
      pki: {
        serverCertificate: gatewayServerCertificate.toString("pem"),
        serverCertificateChain: constructPemChainFromCerts([gatewayServerCaCert, rootGatewayCaCert]),
        serverPrivateKey: gatewayServerCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        clientCA: rootGatewayCaCert.toString("pem")
      },
      ssh: {
        clientCertificate: proxyCredentials.clientSshCert,
        clientPrivateKey: proxyCredentials.clientSshPrivateKey,
        serverCAPublicKey: proxyCredentials.serverCAPublicKey
      }
    };
  };

  return {
    registerGateway
  };
};
