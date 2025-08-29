import * as x509 from "@peculiar/x509";

import { TProxies } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { constructPemChainFromCerts, prependCertToPemChain } from "@app/services/certificate/certificate-fns";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { createSshCert, createSshKeyPair } from "../ssh/ssh-certificate-authority-fns";
import { SshCertType } from "../ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "../ssh-certificate/ssh-certificate-types";
import { TInstanceProxyConfigDALFactory } from "./instance-proxy-config-dal";
import { TOrgProxyConfigDALFactory } from "./org-proxy-config-dal";
import { TProxyDALFactory } from "./proxy-dal";
import { isInstanceProxy } from "./proxy-fns";

export type TProxyServiceFactory = ReturnType<typeof proxyServiceFactory>;

const INSTANCE_PROXY_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export const proxyServiceFactory = ({
  instanceProxyConfigDAL,
  orgProxyConfigDAL,
  proxyDAL,
  kmsService
}: {
  instanceProxyConfigDAL: TInstanceProxyConfigDALFactory;
  orgProxyConfigDAL: TOrgProxyConfigDALFactory;
  proxyDAL: TProxyDALFactory;
  kmsService: TKmsServiceFactory;
}) => {
  const $getInstanceCAs = async () => {
    const instanceConfig = await instanceProxyConfigDAL.transaction(async (tx) => {
      const existingInstanceProxyConfig = await instanceProxyConfigDAL.findById(INSTANCE_PROXY_CONFIG_UUID);
      if (existingInstanceProxyConfig) return existingInstanceProxyConfig;

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.InstanceProxyConfigInit()]);

      const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
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
          new x509.BasicConstraintsExtension(true, 2, true),
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
          new x509.BasicConstraintsExtension(true, 1, true),
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

  const $getOrgCAs = async (orgId: string) => {
    const instanceCAs = await $getInstanceCAs();
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const orgProxyConfig = await orgProxyConfigDAL.transaction(async (tx) => {
      const existingOrgProxyConfig = await orgProxyConfigDAL.findOne(
        {
          orgId
        },
        tx
      );

      if (existingOrgProxyConfig) {
        return existingOrgProxyConfig;
      }

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgProxyConfigInit(orgId)]);

      const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
      const orgProxyCaCert = new x509.X509Certificate(instanceCAs.orgProxyPkiCaCertificate);
      const rootProxyCaCert = new x509.X509Certificate(instanceCAs.rootProxyPkiCaCertificate);
      const orgProxyCaSkObj = crypto.nativeCrypto.createPrivateKey({
        key: instanceCAs.orgProxyPkiCaPrivateKey,
        format: "der",
        type: "pkcs8"
      });
      const orgProxyClientCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
        "pkcs8",
        orgProxyCaSkObj.export({ format: "der", type: "pkcs8" }),
        alg,
        true,
        ["sign"]
      );

      // generate org proxy client CA
      const orgProxyClientCaSerialNumber = createSerialNumber();
      const orgProxyClientCaIssuedAt = new Date();
      const orgProxyClientCaExpiration = new Date(new Date().setFullYear(2045));
      const orgProxyClientCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const orgProxyClientCaSkObj = crypto.nativeCrypto.KeyObject.from(orgProxyClientCaKeys.privateKey);
      const orgProxyClientCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: orgProxyClientCaSerialNumber,
        subject: `O=${orgId},CN=Infisical Org Proxy Client CA`,
        issuer: orgProxyCaCert.subject,
        notBefore: orgProxyClientCaIssuedAt,
        notAfter: orgProxyClientCaExpiration,
        signingKey: orgProxyClientCaPrivateKey,
        publicKey: orgProxyClientCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(orgProxyCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(orgProxyClientCaKeys.publicKey)
        ]
      });
      const orgProxyClientCaChain = constructPemChainFromCerts([orgProxyCaCert, rootProxyCaCert]);

      // generate org SSH CA
      const orgSshServerCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);
      const orgSshClientCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);

      // generate org proxy server CA
      const orgProxyServerCaSerialNumber = createSerialNumber();
      const orgProxyServerCaIssuedAt = new Date();
      const orgProxyServerCaExpiration = new Date(new Date().setFullYear(2045));
      const orgProxyServerCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const orgProxyServerCaSkObj = crypto.nativeCrypto.KeyObject.from(orgProxyServerCaKeys.privateKey);
      const orgProxyServerCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: orgProxyServerCaSerialNumber,
        subject: `O=${orgId},CN=Infisical Org Proxy Server CA`,
        issuer: orgProxyCaCert.subject,
        notBefore: orgProxyServerCaIssuedAt,
        notAfter: orgProxyServerCaExpiration,
        signingKey: orgProxyClientCaPrivateKey,
        publicKey: orgProxyServerCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(orgProxyCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(orgProxyServerCaKeys.publicKey)
        ]
      });
      const orgProxyServerCaChain = constructPemChainFromCerts([orgProxyCaCert, rootProxyCaCert]);

      const encryptedProxyPkiClientCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(
          orgProxyClientCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      }).cipherTextBlob;
      const encryptedProxyPkiClientCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(orgProxyClientCaCert.rawData)
      }).cipherTextBlob;

      const encryptedProxyPkiClientCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(orgProxyClientCaChain)
      }).cipherTextBlob;

      const encryptedProxyPkiServerCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(
          orgProxyServerCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      }).cipherTextBlob;
      const encryptedProxyPkiServerCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(orgProxyServerCaCert.rawData)
      }).cipherTextBlob;
      const encryptedProxyPkiServerCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(orgProxyServerCaChain)
      }).cipherTextBlob;

      const encryptedProxySshClientCaPublicKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshClientCaKeyPair.publicKey)
      }).cipherTextBlob;
      const encryptedProxySshClientCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshClientCaKeyPair.privateKey)
      }).cipherTextBlob;

      const encryptedProxySshServerCaPublicKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshServerCaKeyPair.publicKey)
      }).cipherTextBlob;
      const encryptedProxySshServerCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshServerCaKeyPair.privateKey)
      }).cipherTextBlob;

      return orgProxyConfigDAL.create({
        orgId,
        encryptedProxyPkiClientCaPrivateKey,
        encryptedProxyPkiClientCaCertificate,
        encryptedProxyPkiClientCaCertificateChain,
        encryptedProxyPkiServerCaPrivateKey,
        encryptedProxyPkiServerCaCertificate,
        encryptedProxyPkiServerCaCertificateChain,
        encryptedProxySshClientCaPublicKey,
        encryptedProxySshClientCaPrivateKey,
        encryptedProxySshServerCaPublicKey,
        encryptedProxySshServerCaPrivateKey
      });
    });

    const proxyPkiClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxyPkiClientCaPrivateKey
    });
    const proxyPkiClientCaCertificate = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxyPkiClientCaCertificate
    });
    const proxyPkiClientCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxyPkiClientCaCertificateChain
    });

    const proxyPkiServerCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxyPkiServerCaPrivateKey
    });
    const proxyPkiServerCaCertificate = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxyPkiServerCaCertificate
    });
    const proxyPkiServerCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxyPkiServerCaCertificateChain
    });

    const proxySshClientCaPublicKey = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxySshClientCaPublicKey
    });
    const proxySshClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxySshClientCaPrivateKey
    });

    const proxySshServerCaPublicKey = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxySshServerCaPublicKey
    });
    const proxySshServerCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgProxyConfig.encryptedProxySshServerCaPrivateKey
    });

    return {
      proxyPkiClientCaPrivateKey,
      proxyPkiClientCaCertificate,
      proxyPkiClientCaCertificateChain,
      proxyPkiServerCaPrivateKey,
      proxyPkiServerCaCertificate,
      proxyPkiServerCaCertificateChain,
      proxySshClientCaPublicKey,
      proxySshClientCaPrivateKey,
      proxySshServerCaPublicKey,
      proxySshServerCaPrivateKey
    };
  };

  const $generateProxyServerCredentials = async ({
    ip,
    orgId,
    proxyPkiServerCaCertificate,
    proxyPkiServerCaPrivateKey,
    proxyPkiClientCaCertificate,
    proxyPkiClientCaCertificateChain,
    proxySshClientCaPublicKey,
    proxySshServerCaPrivateKey
  }: {
    ip: string;
    proxyPkiServerCaCertificate: Buffer;
    proxyPkiServerCaPrivateKey: Buffer;
    proxyPkiClientCaCertificateChain: Buffer;
    proxyPkiClientCaCertificate: Buffer;
    proxySshServerCaPrivateKey: Buffer;
    proxySshClientCaPublicKey: Buffer;
    orgId?: string;
  }) => {
    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const proxyServerCaCert = new x509.X509Certificate(proxyPkiServerCaCertificate);
    const proxyClientCaCert = new x509.X509Certificate(proxyPkiClientCaCertificate);
    const proxyServerCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: proxyPkiServerCaPrivateKey,
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
      subject: `CN=${ip},O=${orgId ?? "Infisical"},OU=Proxy`,
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
      caPrivateKey: proxySshServerCaPrivateKey.toString("utf8"),
      clientPublicKey: proxyServerSshPublicKey,
      keyId: "proxy-server",
      principals: [`${ip}:2222`],
      certType: SshCertType.HOST,
      requestedTtl: "30d"
    });

    return {
      pki: {
        serverCertificate: proxyServerCertificate.toString("pem"),
        serverPrivateKey: proxyServerCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        clientCertificateChain: prependCertToPemChain(
          proxyClientCaCert,
          proxyPkiClientCaCertificateChain.toString("utf8")
        )
      },
      ssh: {
        serverCertificate: proxyServerSshCert.signedPublicKey,
        serverPrivateKey: proxyServerSshPrivateKey,
        clientCAPublicKey: proxySshClientCaPublicKey.toString("utf8")
      }
    };
  };

  const $generateProxyClientCredentials = async ({
    actor,
    gatewayId,
    orgId,
    proxyPkiClientCaCertificate,
    proxyPkiClientCaPrivateKey,
    proxyPkiServerCaCertificate,
    proxyPkiServerCaCertificateChain
  }: {
    actor: ActorType;
    gatewayId: string;
    orgId: string;
    proxyPkiClientCaCertificate: Buffer;
    proxyPkiClientCaPrivateKey: Buffer;
    proxyPkiServerCaCertificate: Buffer;
    proxyPkiServerCaCertificateChain: Buffer;
  }) => {
    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const proxyClientCaCert = new x509.X509Certificate(proxyPkiClientCaCertificate);
    const proxyServerCaCert = new x509.X509Certificate(proxyPkiServerCaCertificate);
    const proxyClientCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: proxyPkiClientCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const importedProxyClientCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      proxyClientCaSkObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const clientCertIssuedAt = new Date();
    const clientCertExpiration = new Date(new Date().getTime() + 5 * 60 * 1000);
    const clientKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const clientCertPrivateKey = crypto.nativeCrypto.KeyObject.from(clientKeys.privateKey);
    const clientCertSerialNumber = createSerialNumber();

    const clientCert = await x509.X509CertificateGenerator.create({
      serialNumber: clientCertSerialNumber,
      subject: `O=${orgId},OU=proxy-client,CN=${actor}:${gatewayId}`,
      issuer: proxyClientCaCert.subject,
      notAfter: clientCertExpiration,
      notBefore: clientCertIssuedAt,
      signingKey: importedProxyClientCaPrivateKey,
      publicKey: clientKeys.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(proxyClientCaCert, false),
        await x509.SubjectKeyIdentifierExtension.create(clientKeys.publicKey),
        new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
        new x509.KeyUsagesExtension(
          // eslint-disable-next-line no-bitwise
          x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT] |
            x509.KeyUsageFlags[CertKeyUsage.KEY_AGREEMENT],
          true
        ),
        new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.CLIENT_AUTH]], true)
      ]
    });

    return {
      clientCertificate: clientCert.toString("pem"),
      clientPrivateKey: clientCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      serverCertificateChain: prependCertToPemChain(
        proxyServerCaCert,
        proxyPkiServerCaCertificateChain.toString("utf8")
      )
    };
  };

  const getCredentialsForGateway = async ({
    proxyName,
    orgId,
    gatewayId
  }: {
    proxyName: string;
    orgId: string;
    gatewayId: string;
  }) => {
    let proxy: TProxies | null;
    if (isInstanceProxy(proxyName)) {
      proxy = await proxyDAL.findOne({
        name: proxyName
      });
    } else {
      proxy = await proxyDAL.findOne({
        orgId,
        name: proxyName
      });
    }

    if (!proxy) {
      throw new NotFoundError({
        message: "Proxy not found"
      });
    }

    const keyAlgorithm = SshCertKeyAlgorithm.RSA_2048;
    const { publicKey: proxyClientSshPublicKey, privateKey: proxyClientSshPrivateKey } =
      await createSshKeyPair(keyAlgorithm);

    if (isInstanceProxy(proxyName)) {
      const instanceCAs = await $getInstanceCAs();
      const proxyClientSshCert = await createSshCert({
        caPrivateKey: instanceCAs.instanceProxySshServerCaPrivateKey.toString("utf8"),
        clientPublicKey: proxyClientSshPublicKey,
        keyId: `proxy-client-${proxy.id}`,
        principals: [gatewayId],
        certType: SshCertType.USER,
        requestedTtl: "30d"
      });

      return {
        proxyIp: proxy.ip,
        clientSshCert: proxyClientSshCert.signedPublicKey,
        clientSshPrivateKey: proxyClientSshPrivateKey,
        serverCAPublicKey: instanceCAs.instanceProxySshServerCaPublicKey.toString("utf8")
      };
    }

    const orgCAs = await $getOrgCAs(orgId);
    const proxyClientSshCert = await createSshCert({
      caPrivateKey: orgCAs.proxySshServerCaPrivateKey.toString("utf8"),
      clientPublicKey: proxyClientSshPublicKey,
      keyId: `proxy-client-${proxy.id}`,
      principals: [gatewayId],
      certType: SshCertType.USER,
      requestedTtl: "30d"
    });

    return {
      proxyIp: proxy.ip,
      clientSshCert: proxyClientSshCert.signedPublicKey,
      clientSshPrivateKey: proxyClientSshPrivateKey,
      serverCAPublicKey: orgCAs.proxySshServerCaPublicKey.toString("utf8")
    };
  };

  const getCredentialsForClient = async ({
    proxyId,
    orgId,
    gatewayId,
    actor
  }: {
    proxyId: string;
    orgId: string;
    gatewayId: string;
    actor: ActorType;
  }) => {
    const proxy = await proxyDAL.findOne({
      id: proxyId
    });

    if (!proxy) {
      throw new NotFoundError({
        message: "Proxy not found"
      });
    }

    if (isInstanceProxy(proxy.name)) {
      const instanceCAs = await $getInstanceCAs();
      const proxyCertificateCredentials = await $generateProxyClientCredentials({
        actor,
        gatewayId,
        orgId,
        proxyPkiClientCaCertificate: instanceCAs.instanceProxyPkiClientCaCertificate,
        proxyPkiClientCaPrivateKey: instanceCAs.instanceProxyPkiClientCaPrivateKey,
        proxyPkiServerCaCertificate: instanceCAs.instanceProxyPkiServerCaCertificate,
        proxyPkiServerCaCertificateChain: instanceCAs.instanceProxyPkiServerCaCertificateChain
      });

      return {
        ...proxyCertificateCredentials,
        proxyIp: proxy.ip
      };
    }

    const orgCAs = await $getOrgCAs(orgId);
    const proxyCertificateCredentials = await $generateProxyClientCredentials({
      actor,
      gatewayId,
      orgId,
      proxyPkiClientCaCertificate: orgCAs.proxyPkiClientCaCertificate,
      proxyPkiClientCaPrivateKey: orgCAs.proxyPkiClientCaPrivateKey,
      proxyPkiServerCaCertificate: orgCAs.proxyPkiServerCaCertificate,
      proxyPkiServerCaCertificateChain: orgCAs.proxyPkiServerCaCertificateChain
    });

    return {
      ...proxyCertificateCredentials,
      proxyIp: proxy.ip
    };
  };

  const registerProxy = async ({
    ip,
    name,
    identityId,
    orgId
  }: {
    ip: string;
    name: string;
    identityId?: string;
    orgId?: string;
  }) => {
    let proxy: TProxies;
    const isOrgProxy = identityId && orgId;

    if (isOrgProxy) {
      // organization proxy
      if (isInstanceProxy(name)) {
        throw new BadRequestError({
          message: "Org proxy name cannot start with 'infisical-'. This is reserved for internal use."
        });
      }

      proxy = await proxyDAL.transaction(async (tx) => {
        const existingProxy = await proxyDAL.findOne(
          {
            identityId,
            orgId
          },
          tx
        );

        if (existingProxy && (existingProxy.ip !== ip || existingProxy.name !== name)) {
          throw new BadRequestError({
            message: "Org proxy with this machine identity already exists."
          });
        }

        if (!existingProxy) {
          return proxyDAL.create(
            {
              ip,
              name,
              identityId,
              orgId
            },
            tx
          );
        }

        return existingProxy;
      });
    } else {
      // instance proxy
      if (!name.startsWith("infisical-")) {
        throw new BadRequestError({
          message: "Instance proxy name must start with 'infisical-'."
        });
      }

      proxy = await proxyDAL.transaction(async (tx) => {
        const existingProxy = await proxyDAL.findOne(
          {
            name
          },
          tx
        );

        if (existingProxy && existingProxy.ip !== ip) {
          throw new BadRequestError({
            message: "Instance proxy with this name already exists"
          });
        }

        if (!existingProxy) {
          return proxyDAL.create(
            {
              ip,
              name
            },
            tx
          );
        }

        return existingProxy;
      });
    }

    if (isInstanceProxy(name)) {
      const instanceCAs = await $getInstanceCAs();
      return $generateProxyServerCredentials({
        ip,
        proxyPkiServerCaCertificate: instanceCAs.instanceProxyPkiServerCaCertificate,
        proxyPkiServerCaPrivateKey: instanceCAs.instanceProxyPkiServerCaPrivateKey,
        proxyPkiClientCaCertificate: instanceCAs.instanceProxyPkiClientCaCertificate,
        proxyPkiClientCaCertificateChain: instanceCAs.instanceProxyPkiClientCaCertificateChain,
        proxySshServerCaPrivateKey: instanceCAs.instanceProxySshServerCaPrivateKey,
        proxySshClientCaPublicKey: instanceCAs.instanceProxySshClientCaPublicKey
      });
    }

    if (proxy.orgId) {
      const orgCAs = await $getOrgCAs(proxy.orgId);
      return $generateProxyServerCredentials({
        ip,
        orgId: proxy.orgId,
        proxyPkiServerCaCertificate: orgCAs.proxyPkiServerCaCertificate,
        proxyPkiServerCaPrivateKey: orgCAs.proxyPkiServerCaPrivateKey,
        proxyPkiClientCaCertificate: orgCAs.proxyPkiClientCaCertificate,
        proxyPkiClientCaCertificateChain: orgCAs.proxyPkiClientCaCertificateChain,
        proxySshServerCaPrivateKey: orgCAs.proxySshServerCaPrivateKey,
        proxySshClientCaPublicKey: orgCAs.proxySshClientCaPublicKey
      });
    }

    throw new BadRequestError({
      message: "Unhandled proxy type"
    });
  };

  return {
    registerProxy,
    getCredentialsForGateway,
    getCredentialsForClient
  };
};
