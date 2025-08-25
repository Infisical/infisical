import * as x509 from "@peculiar/x509";

import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { constructPemChainFromCerts, prependCertToPemChain } from "@app/services/certificate/certificate-fns";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { createSshCert, createSshKeyPair } from "../ssh/ssh-certificate-authority-fns";
import { SshCertType } from "../ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "../ssh-certificate/ssh-certificate-types";
import { TInstanceProxyConfigDALFactory } from "./instance-proxy-config-dal";
import { TOrgProxyConfigDALFactory } from "./org-proxy-config-dal";

export type TProxyServiceFactory = ReturnType<typeof proxyServiceFactory>;

const INSTANCE_PROXY_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export const proxyServiceFactory = ({
  instanceProxyConfigDAL,
  orgProxyConfigDAL,
  kmsService
}: {
  instanceProxyConfigDAL: TInstanceProxyConfigDALFactory;
  orgProxyConfigDAL: TOrgProxyConfigDALFactory;
  kmsService: TKmsServiceFactory;
}) => {
  const $getInstanceCAs = async () => {
    const instanceConfig = await instanceProxyConfigDAL.transaction(async (tx) => {
      const existingInstanceProxyConfig = await instanceProxyConfigDAL.findById(INSTANCE_PROXY_CONFIG_UUID);
      if (existingInstanceProxyConfig) return existingInstanceProxyConfig;

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.InstanceProxyConfigInit()]);

      const rootCaKeyAlgorithm = CertKeyAlgorithm.RSA_2048;
      const alg = keyAlgorithmToAlgCfg(rootCaKeyAlgorithm);
      const rootCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

      // generate root CA
      const rootCaSerialNumber = createSerialNumber();
      const rootCaSkObj = crypto.nativeCrypto.KeyObject.from(rootCaKeys.privateKey);
      const rootCaIssuedAt = new Date();
      const rootCaExpiration = new Date(new Date().setFullYear(2045));
      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `O=Infisical,CN=Infisical Instance Root Proxy CA`,
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

      // generate org proxy CA
      const orgProxyCaSerialNumber = createSerialNumber();
      const orgProxyCaIssuedAt = new Date();
      const orgProxyCaExpiration = new Date(new Date().setFullYear(2045));
      const orgProxyCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const orgProxyCaSkObj = crypto.nativeCrypto.KeyObject.from(orgProxyCaKeys.privateKey);
      const orgProxyCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: orgProxyCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Organization Proxy CA`,
        issuer: rootCaCert.subject,
        notBefore: orgProxyCaIssuedAt,
        notAfter: orgProxyCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: orgProxyCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(orgProxyCaKeys.publicKey)
        ]
      });
      const orgProxyCaChain = constructPemChainFromCerts([rootCaCert]);

      // generate instance proxy CA
      const instanceProxyCaSerialNumber = createSerialNumber();
      const instanceProxyCaIssuedAt = new Date();
      const instanceProxyCaExpiration = new Date(new Date().setFullYear(2045));
      const instanceProxyCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const instanceProxyCaSkObj = crypto.nativeCrypto.KeyObject.from(instanceProxyCaKeys.privateKey);
      const instanceProxyCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: instanceProxyCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Instance Proxy CA`,
        issuer: rootCaCert.subject,
        notBefore: instanceProxyCaIssuedAt,
        notAfter: instanceProxyCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: instanceProxyCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(instanceProxyCaKeys.publicKey)
        ]
      });
      const instanceProxyCaChain = constructPemChainFromCerts([rootCaCert]);

      // generate instance proxy client CA
      const instanceProxyClientCaSerialNumber = createSerialNumber();
      const instanceProxyClientCaIssuedAt = new Date();
      const instanceProxyClientCaExpiration = new Date(new Date().setFullYear(2045));
      const instanceProxyClientCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const instanceProxyClientCaSkObj = crypto.nativeCrypto.KeyObject.from(instanceProxyClientCaKeys.privateKey);
      const instanceProxyClientCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: instanceProxyClientCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Instance Proxy Client CA`,
        issuer: instanceProxyCaCert.subject,
        notBefore: instanceProxyClientCaIssuedAt,
        notAfter: instanceProxyClientCaExpiration,
        signingKey: instanceProxyCaKeys.privateKey,
        publicKey: instanceProxyClientCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(instanceProxyCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(instanceProxyClientCaKeys.publicKey)
        ]
      });
      const instanceProxyClientCaChain = constructPemChainFromCerts([instanceProxyCaCert, rootCaCert]);

      // generate instance proxy server CA
      const instanceProxyServerCaSerialNumber = createSerialNumber();
      const instanceProxyServerCaIssuedAt = new Date();
      const instanceProxyServerCaExpiration = new Date(new Date().setFullYear(2045));
      const instanceProxyServerCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const instanceProxyServerCaSkObj = crypto.nativeCrypto.KeyObject.from(instanceProxyServerCaKeys.privateKey);
      const instanceProxyServerCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: instanceProxyServerCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Instance Proxy Server CA`,
        issuer: instanceProxyCaCert.subject,
        notBefore: instanceProxyServerCaIssuedAt,
        notAfter: instanceProxyServerCaExpiration,
        signingKey: instanceProxyCaKeys.privateKey,
        publicKey: instanceProxyServerCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(instanceProxyCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(instanceProxyServerCaKeys.publicKey)
        ]
      });
      const instanceProxyServerCaChain = constructPemChainFromCerts([instanceProxyCaCert, rootCaCert]);

      const instanceSshServerCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);
      const instanceSshClientCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);

      const encryptWithRoot = kmsService.encryptWithRootKey();

      // root proxy CA
      const encryptedRootProxyPkiCaPrivateKey = encryptWithRoot(
        Buffer.from(
          rootCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedRootProxyPkiCaCertificate = encryptWithRoot(Buffer.from(rootCaCert.rawData));

      // org proxy CA
      const encryptedOrgProxyPkiCaPrivateKey = encryptWithRoot(
        Buffer.from(
          orgProxyCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedOrgProxyPkiCaCertificate = encryptWithRoot(Buffer.from(orgProxyCaCert.rawData));
      const encryptedOrgProxyPkiCaCertificateChain = encryptWithRoot(Buffer.from(orgProxyCaChain));

      // instance proxy CA
      const encryptedInstanceProxyPkiCaPrivateKey = encryptWithRoot(
        Buffer.from(
          instanceProxyCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedInstanceProxyPkiCaCertificate = encryptWithRoot(Buffer.from(instanceProxyCaCert.rawData));
      const encryptedInstanceProxyPkiCaCertificateChain = encryptWithRoot(Buffer.from(instanceProxyCaChain));

      // instance proxy client CA
      const encryptedInstanceProxyPkiClientCaPrivateKey = encryptWithRoot(
        Buffer.from(
          instanceProxyClientCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedInstanceProxyPkiClientCaCertificate = encryptWithRoot(
        Buffer.from(instanceProxyClientCaCert.rawData)
      );
      const encryptedInstanceProxyPkiClientCaCertificateChain = encryptWithRoot(
        Buffer.from(instanceProxyClientCaChain)
      );

      // instance proxy server CA
      const encryptedInstanceProxyPkiServerCaPrivateKey = encryptWithRoot(
        Buffer.from(
          instanceProxyServerCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedInstanceProxyPkiServerCaCertificate = encryptWithRoot(
        Buffer.from(instanceProxyServerCaCert.rawData)
      );
      const encryptedInstanceProxyPkiServerCaCertificateChain = encryptWithRoot(
        Buffer.from(instanceProxyServerCaChain)
      );

      const encryptedInstanceProxySshClientCaPublicKey = encryptWithRoot(
        Buffer.from(instanceSshClientCaKeyPair.publicKey)
      );
      const encryptedInstanceProxySshClientCaPrivateKey = encryptWithRoot(
        Buffer.from(instanceSshClientCaKeyPair.privateKey)
      );

      const encryptedInstanceProxySshServerCaPublicKey = encryptWithRoot(
        Buffer.from(instanceSshServerCaKeyPair.publicKey)
      );
      const encryptedInstanceProxySshServerCaPrivateKey = encryptWithRoot(
        Buffer.from(instanceSshServerCaKeyPair.privateKey)
      );

      return instanceProxyConfigDAL.create({
        // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
        id: INSTANCE_PROXY_CONFIG_UUID,
        encryptedRootProxyPkiCaPrivateKey,
        encryptedRootProxyPkiCaCertificate,
        encryptedInstanceProxyPkiCaPrivateKey,
        encryptedInstanceProxyPkiCaCertificate,
        encryptedInstanceProxyPkiCaCertificateChain,
        encryptedInstanceProxyPkiClientCaPrivateKey,
        encryptedInstanceProxyPkiClientCaCertificate,
        encryptedInstanceProxyPkiClientCaCertificateChain,
        encryptedInstanceProxyPkiServerCaPrivateKey,
        encryptedInstanceProxyPkiServerCaCertificate,
        encryptedInstanceProxyPkiServerCaCertificateChain,
        encryptedOrgProxyPkiCaPrivateKey,
        encryptedOrgProxyPkiCaCertificate,
        encryptedOrgProxyPkiCaCertificateChain,
        encryptedInstanceProxySshClientCaPublicKey,
        encryptedInstanceProxySshClientCaPrivateKey,
        encryptedInstanceProxySshServerCaPublicKey,
        encryptedInstanceProxySshServerCaPrivateKey
      });
    });

    // decrypt the instance config
    const decryptWithRoot = kmsService.decryptWithRootKey();

    // decrypt root proxy CA
    const rootProxyPkiCaPrivateKey = decryptWithRoot(instanceConfig.encryptedRootProxyPkiCaPrivateKey);
    const rootProxyPkiCaCertificate = decryptWithRoot(instanceConfig.encryptedRootProxyPkiCaCertificate);

    // decrypt org proxy CA
    const orgProxyPkiCaPrivateKey = decryptWithRoot(instanceConfig.encryptedOrgProxyPkiCaPrivateKey);
    const orgProxyPkiCaCertificate = decryptWithRoot(instanceConfig.encryptedOrgProxyPkiCaCertificate);
    const orgProxyPkiCaCertificateChain = decryptWithRoot(instanceConfig.encryptedOrgProxyPkiCaCertificateChain);

    // decrypt instance proxy CA
    const instanceProxyPkiCaPrivateKey = decryptWithRoot(instanceConfig.encryptedInstanceProxyPkiCaPrivateKey);
    const instanceProxyPkiCaCertificate = decryptWithRoot(instanceConfig.encryptedInstanceProxyPkiCaCertificate);
    const instanceProxyPkiCaCertificateChain = decryptWithRoot(
      instanceConfig.encryptedInstanceProxyPkiCaCertificateChain
    );

    // decrypt instance proxy client CA
    const instanceProxyPkiClientCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceProxyPkiClientCaPrivateKey
    );
    const instanceProxyPkiClientCaCertificate = decryptWithRoot(
      instanceConfig.encryptedInstanceProxyPkiClientCaCertificate
    );
    const instanceProxyPkiClientCaCertificateChain = decryptWithRoot(
      instanceConfig.encryptedInstanceProxyPkiClientCaCertificateChain
    );

    // decrypt instance proxy server CA
    const instanceProxyPkiServerCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceProxyPkiServerCaPrivateKey
    );
    const instanceProxyPkiServerCaCertificate = decryptWithRoot(
      instanceConfig.encryptedInstanceProxyPkiServerCaCertificate
    );
    const instanceProxyPkiServerCaCertificateChain = decryptWithRoot(
      instanceConfig.encryptedInstanceProxyPkiServerCaCertificateChain
    );

    // decrypt SSH keys
    const instanceProxySshClientCaPublicKey = decryptWithRoot(
      instanceConfig.encryptedInstanceProxySshClientCaPublicKey
    );
    const instanceProxySshClientCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceProxySshClientCaPrivateKey
    );
    const instanceProxySshServerCaPublicKey = decryptWithRoot(
      instanceConfig.encryptedInstanceProxySshServerCaPublicKey
    );
    const instanceProxySshServerCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceProxySshServerCaPrivateKey
    );

    return {
      rootProxyPkiCaPrivateKey,
      rootProxyPkiCaCertificate,
      orgProxyPkiCaPrivateKey,
      orgProxyPkiCaCertificate,
      orgProxyPkiCaCertificateChain,
      instanceProxyPkiCaPrivateKey,
      instanceProxyPkiCaCertificate,
      instanceProxyPkiCaCertificateChain,
      instanceProxyPkiClientCaPrivateKey,
      instanceProxyPkiClientCaCertificate,
      instanceProxyPkiClientCaCertificateChain,
      instanceProxyPkiServerCaPrivateKey,
      instanceProxyPkiServerCaCertificate,
      instanceProxyPkiServerCaCertificateChain,
      instanceProxySshClientCaPublicKey,
      instanceProxySshClientCaPrivateKey,
      instanceProxySshServerCaPublicKey,
      instanceProxySshServerCaPrivateKey
    };
  };

  const registerProxy = async ({ ip }: { ip: string }) => {
    // initialize instance CAs if not yet initialized
    const instanceCAs = await $getInstanceCAs();

    // TODO: check if identity used already has an existing proxy. If the same IP, return the existing proxy. If not, create a new proxy and overwrite

    // generate proxy server PKI certificate
    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const proxyServerCaCert = new x509.X509Certificate(instanceCAs.instanceProxyPkiServerCaCertificate);
    const rootProxyCaCert = new x509.X509Certificate(instanceCAs.rootProxyPkiCaCertificate);
    const proxyServerCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: instanceCAs.instanceProxyPkiServerCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });
    const proxyServerCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      proxyServerCaSkObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const proxyServerKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const proxyServerCertIssuedAt = new Date();
    const proxyServerCertExpireAt = new Date(new Date().setMonth(new Date().getMonth() + 1));
    const proxyServerCertPrivateKey = crypto.nativeCrypto.KeyObject.from(proxyServerKeys.privateKey);

    const proxyServerCertExtensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(proxyServerCaCert, false),
      await x509.SubjectKeyIdentifierExtension.create(proxyServerKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true),
      // san
      new x509.SubjectAlternativeNameExtension([{ type: "ip", value: ip }], false)
    ];

    const proxyServerSerialNumber = createSerialNumber();
    const proxyServerCertificate = await x509.X509CertificateGenerator.create({
      serialNumber: proxyServerSerialNumber,
      subject: `CN=${ip},O=Infisical,OU=Proxy`,
      issuer: proxyServerCaCert.subject,
      notBefore: proxyServerCertIssuedAt,
      notAfter: proxyServerCertExpireAt,
      signingKey: proxyServerCaPrivateKey,
      publicKey: proxyServerKeys.publicKey,
      signingAlgorithm: alg,
      extensions: proxyServerCertExtensions
    });

    // generate proxy server SSH certificate
    const keyAlgorithm = SshCertKeyAlgorithm.RSA_2048;
    const { publicKey: proxyServerSshPublicKey, privateKey: proxyServerSshPrivateKey } =
      await createSshKeyPair(keyAlgorithm);

    const proxyServerSshCert = await createSshCert({
      caPrivateKey: instanceCAs.instanceProxySshServerCaPrivateKey.toString("utf8"),
      clientPublicKey: proxyServerSshPublicKey,
      keyId: "proxy-server",
      principals: [ip],
      certType: SshCertType.HOST,
      requestedTtl: "30d"
    });

    return {
      pki: {
        serverCertificate: proxyServerCertificate.toString("pem"),
        serverCertificateChain: prependCertToPemChain(
          proxyServerCaCert,
          instanceCAs.instanceProxyPkiServerCaCertificateChain.toString("utf8")
        ),
        serverPrivateKey: proxyServerCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        clientCA: rootProxyCaCert.toString("pem")
      },
      ssh: {
        serverCertificate: proxyServerSshCert.signedPublicKey,
        serverPrivateKey: proxyServerSshPrivateKey,
        clientCAPublicKey: instanceCAs.instanceProxySshClientCaPublicKey.toString("utf8")
      }
    };
  };

  return {
    registerProxy
  };
};
