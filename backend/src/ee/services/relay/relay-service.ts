import * as x509 from "@peculiar/x509";

import { TRelays } from "@app/db/schemas";
import { PgSqlLock } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { constructPemChainFromCerts, prependCertToPemChain } from "@app/services/certificate/certificate-fns";
import { CertExtendedKeyUsage, CertKeyAlgorithm, CertKeyUsage } from "@app/services/certificate/certificate-types";
import {
  createSerialNumber,
  keyAlgorithmToAlgCfg
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { verifyHostInputValidity } from "../dynamic-secret/dynamic-secret-fns";
import { createSshCert, createSshKeyPair } from "../ssh/ssh-certificate-authority-fns";
import { SshCertType } from "../ssh/ssh-certificate-authority-types";
import { SshCertKeyAlgorithm } from "../ssh-certificate/ssh-certificate-types";
import { TInstanceRelayConfigDALFactory } from "./instance-relay-config-dal";
import { TOrgRelayConfigDALFactory } from "./org-relay-config-dal";
import { TRelayDALFactory } from "./relay-dal";

export type TRelayServiceFactory = ReturnType<typeof relayServiceFactory>;

const INSTANCE_RELAY_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

export const relayServiceFactory = ({
  instanceRelayConfigDAL,
  orgRelayConfigDAL,
  relayDAL,
  kmsService
}: {
  instanceRelayConfigDAL: TInstanceRelayConfigDALFactory;
  orgRelayConfigDAL: TOrgRelayConfigDALFactory;
  relayDAL: TRelayDALFactory;
  kmsService: TKmsServiceFactory;
}) => {
  const $getInstanceCAs = async () => {
    const instanceConfig = await instanceRelayConfigDAL.transaction(async (tx) => {
      const existingInstanceRelayConfig = await instanceRelayConfigDAL.findById(INSTANCE_RELAY_CONFIG_UUID);
      if (existingInstanceRelayConfig) return existingInstanceRelayConfig;

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.InstanceRelayConfigInit()]);

      const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
      const rootCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

      // generate root CA
      const rootCaSerialNumber = createSerialNumber();
      const rootCaSkObj = crypto.nativeCrypto.KeyObject.from(rootCaKeys.privateKey);
      const rootCaIssuedAt = new Date();
      const rootCaExpiration = new Date(new Date().setFullYear(2045));
      const rootCaCert = await x509.X509CertificateGenerator.createSelfSigned({
        name: `O=Infisical,CN=Infisical Instance Root Relay CA`,
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

      // generate org relay CA
      const orgRelayCaSerialNumber = createSerialNumber();
      const orgRelayCaIssuedAt = new Date();
      const orgRelayCaExpiration = new Date(new Date().setFullYear(2045));
      const orgRelayCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const orgRelayCaSkObj = crypto.nativeCrypto.KeyObject.from(orgRelayCaKeys.privateKey);
      const orgRelayCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: orgRelayCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Organization Relay CA`,
        issuer: rootCaCert.subject,
        notBefore: orgRelayCaIssuedAt,
        notAfter: orgRelayCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: orgRelayCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(orgRelayCaKeys.publicKey)
        ]
      });
      const orgRelayCaChain = constructPemChainFromCerts([rootCaCert]);

      // generate instance relay CA
      const instanceRelayCaSerialNumber = createSerialNumber();
      const instanceRelayCaIssuedAt = new Date();
      const instanceRelayCaExpiration = new Date(new Date().setFullYear(2045));
      const instanceRelayCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const instanceRelayCaSkObj = crypto.nativeCrypto.KeyObject.from(instanceRelayCaKeys.privateKey);
      const instanceRelayCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: instanceRelayCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Instance Relay CA`,
        issuer: rootCaCert.subject,
        notBefore: instanceRelayCaIssuedAt,
        notAfter: instanceRelayCaExpiration,
        signingKey: rootCaKeys.privateKey,
        publicKey: instanceRelayCaKeys.publicKey,
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
          await x509.SubjectKeyIdentifierExtension.create(instanceRelayCaKeys.publicKey)
        ]
      });
      const instanceRelayCaChain = constructPemChainFromCerts([rootCaCert]);

      // generate instance relay client CA
      const instanceRelayClientCaSerialNumber = createSerialNumber();
      const instanceRelayClientCaIssuedAt = new Date();
      const instanceRelayClientCaExpiration = new Date(new Date().setFullYear(2045));
      const instanceRelayClientCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const instanceRelayClientCaSkObj = crypto.nativeCrypto.KeyObject.from(instanceRelayClientCaKeys.privateKey);
      const instanceRelayClientCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: instanceRelayClientCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Instance Relay Client CA`,
        issuer: instanceRelayCaCert.subject,
        notBefore: instanceRelayClientCaIssuedAt,
        notAfter: instanceRelayClientCaExpiration,
        signingKey: instanceRelayCaKeys.privateKey,
        publicKey: instanceRelayClientCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(instanceRelayCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(instanceRelayClientCaKeys.publicKey)
        ]
      });
      const instanceRelayClientCaChain = constructPemChainFromCerts([instanceRelayCaCert, rootCaCert]);

      // generate instance relay server CA
      const instanceRelayServerCaSerialNumber = createSerialNumber();
      const instanceRelayServerCaIssuedAt = new Date();
      const instanceRelayServerCaExpiration = new Date(new Date().setFullYear(2045));
      const instanceRelayServerCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const instanceRelayServerCaSkObj = crypto.nativeCrypto.KeyObject.from(instanceRelayServerCaKeys.privateKey);
      const instanceRelayServerCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: instanceRelayServerCaSerialNumber,
        subject: `O=Infisical,CN=Infisical Instance Relay Server CA`,
        issuer: instanceRelayCaCert.subject,
        notBefore: instanceRelayServerCaIssuedAt,
        notAfter: instanceRelayServerCaExpiration,
        signingKey: instanceRelayCaKeys.privateKey,
        publicKey: instanceRelayServerCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(instanceRelayCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(instanceRelayServerCaKeys.publicKey)
        ]
      });
      const instanceRelayServerCaChain = constructPemChainFromCerts([instanceRelayCaCert, rootCaCert]);

      const instanceSshServerCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);
      const instanceSshClientCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);

      const encryptWithRoot = kmsService.encryptWithRootKey();

      // root relay CA
      const encryptedRootRelayPkiCaPrivateKey = encryptWithRoot(
        Buffer.from(
          rootCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedRootRelayPkiCaCertificate = encryptWithRoot(Buffer.from(rootCaCert.rawData));

      // org relay CA
      const encryptedOrgRelayPkiCaPrivateKey = encryptWithRoot(
        Buffer.from(
          orgRelayCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedOrgRelayPkiCaCertificate = encryptWithRoot(Buffer.from(orgRelayCaCert.rawData));
      const encryptedOrgRelayPkiCaCertificateChain = encryptWithRoot(Buffer.from(orgRelayCaChain));

      // instance relay CA
      const encryptedInstanceRelayPkiCaPrivateKey = encryptWithRoot(
        Buffer.from(
          instanceRelayCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedInstanceRelayPkiCaCertificate = encryptWithRoot(Buffer.from(instanceRelayCaCert.rawData));
      const encryptedInstanceRelayPkiCaCertificateChain = encryptWithRoot(Buffer.from(instanceRelayCaChain));

      // instance relay client CA
      const encryptedInstanceRelayPkiClientCaPrivateKey = encryptWithRoot(
        Buffer.from(
          instanceRelayClientCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedInstanceRelayPkiClientCaCertificate = encryptWithRoot(
        Buffer.from(instanceRelayClientCaCert.rawData)
      );
      const encryptedInstanceRelayPkiClientCaCertificateChain = encryptWithRoot(
        Buffer.from(instanceRelayClientCaChain)
      );

      // instance relay server CA
      const encryptedInstanceRelayPkiServerCaPrivateKey = encryptWithRoot(
        Buffer.from(
          instanceRelayServerCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      );
      const encryptedInstanceRelayPkiServerCaCertificate = encryptWithRoot(
        Buffer.from(instanceRelayServerCaCert.rawData)
      );
      const encryptedInstanceRelayPkiServerCaCertificateChain = encryptWithRoot(
        Buffer.from(instanceRelayServerCaChain)
      );

      const encryptedInstanceRelaySshClientCaPublicKey = encryptWithRoot(
        Buffer.from(instanceSshClientCaKeyPair.publicKey)
      );
      const encryptedInstanceRelaySshClientCaPrivateKey = encryptWithRoot(
        Buffer.from(instanceSshClientCaKeyPair.privateKey)
      );

      const encryptedInstanceRelaySshServerCaPublicKey = encryptWithRoot(
        Buffer.from(instanceSshServerCaKeyPair.publicKey)
      );
      const encryptedInstanceRelaySshServerCaPrivateKey = encryptWithRoot(
        Buffer.from(instanceSshServerCaKeyPair.privateKey)
      );

      return instanceRelayConfigDAL.create({
        // @ts-expect-error id is kept as fixed for idempotence and to avoid race condition
        id: INSTANCE_RELAY_CONFIG_UUID,
        encryptedRootRelayPkiCaPrivateKey,
        encryptedRootRelayPkiCaCertificate,
        encryptedInstanceRelayPkiCaPrivateKey,
        encryptedInstanceRelayPkiCaCertificate,
        encryptedInstanceRelayPkiCaCertificateChain,
        encryptedInstanceRelayPkiClientCaPrivateKey,
        encryptedInstanceRelayPkiClientCaCertificate,
        encryptedInstanceRelayPkiClientCaCertificateChain,
        encryptedInstanceRelayPkiServerCaPrivateKey,
        encryptedInstanceRelayPkiServerCaCertificate,
        encryptedInstanceRelayPkiServerCaCertificateChain,
        encryptedOrgRelayPkiCaPrivateKey,
        encryptedOrgRelayPkiCaCertificate,
        encryptedOrgRelayPkiCaCertificateChain,
        encryptedInstanceRelaySshClientCaPublicKey,
        encryptedInstanceRelaySshClientCaPrivateKey,
        encryptedInstanceRelaySshServerCaPublicKey,
        encryptedInstanceRelaySshServerCaPrivateKey
      });
    });

    // decrypt the instance config
    const decryptWithRoot = kmsService.decryptWithRootKey();

    // decrypt root relay CA
    const rootRelayPkiCaPrivateKey = decryptWithRoot(instanceConfig.encryptedRootRelayPkiCaPrivateKey);
    const rootRelayPkiCaCertificate = decryptWithRoot(instanceConfig.encryptedRootRelayPkiCaCertificate);

    // decrypt org relay CA
    const orgRelayPkiCaPrivateKey = decryptWithRoot(instanceConfig.encryptedOrgRelayPkiCaPrivateKey);
    const orgRelayPkiCaCertificate = decryptWithRoot(instanceConfig.encryptedOrgRelayPkiCaCertificate);
    const orgRelayPkiCaCertificateChain = decryptWithRoot(instanceConfig.encryptedOrgRelayPkiCaCertificateChain);

    // decrypt instance relay CA
    const instanceRelayPkiCaPrivateKey = decryptWithRoot(instanceConfig.encryptedInstanceRelayPkiCaPrivateKey);
    const instanceRelayPkiCaCertificate = decryptWithRoot(instanceConfig.encryptedInstanceRelayPkiCaCertificate);
    const instanceRelayPkiCaCertificateChain = decryptWithRoot(
      instanceConfig.encryptedInstanceRelayPkiCaCertificateChain
    );

    // decrypt instance relay client CA
    const instanceRelayPkiClientCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceRelayPkiClientCaPrivateKey
    );
    const instanceRelayPkiClientCaCertificate = decryptWithRoot(
      instanceConfig.encryptedInstanceRelayPkiClientCaCertificate
    );
    const instanceRelayPkiClientCaCertificateChain = decryptWithRoot(
      instanceConfig.encryptedInstanceRelayPkiClientCaCertificateChain
    );

    // decrypt instance relay server CA
    const instanceRelayPkiServerCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceRelayPkiServerCaPrivateKey
    );
    const instanceRelayPkiServerCaCertificate = decryptWithRoot(
      instanceConfig.encryptedInstanceRelayPkiServerCaCertificate
    );
    const instanceRelayPkiServerCaCertificateChain = decryptWithRoot(
      instanceConfig.encryptedInstanceRelayPkiServerCaCertificateChain
    );

    // decrypt SSH keys
    const instanceRelaySshClientCaPublicKey = decryptWithRoot(
      instanceConfig.encryptedInstanceRelaySshClientCaPublicKey
    );
    const instanceRelaySshClientCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceRelaySshClientCaPrivateKey
    );
    const instanceRelaySshServerCaPublicKey = decryptWithRoot(
      instanceConfig.encryptedInstanceRelaySshServerCaPublicKey
    );
    const instanceRelaySshServerCaPrivateKey = decryptWithRoot(
      instanceConfig.encryptedInstanceRelaySshServerCaPrivateKey
    );

    return {
      rootRelayPkiCaPrivateKey,
      rootRelayPkiCaCertificate,
      orgRelayPkiCaPrivateKey,
      orgRelayPkiCaCertificate,
      orgRelayPkiCaCertificateChain,
      instanceRelayPkiCaPrivateKey,
      instanceRelayPkiCaCertificate,
      instanceRelayPkiCaCertificateChain,
      instanceRelayPkiClientCaPrivateKey,
      instanceRelayPkiClientCaCertificate,
      instanceRelayPkiClientCaCertificateChain,
      instanceRelayPkiServerCaPrivateKey,
      instanceRelayPkiServerCaCertificate,
      instanceRelayPkiServerCaCertificateChain,
      instanceRelaySshClientCaPublicKey,
      instanceRelaySshClientCaPrivateKey,
      instanceRelaySshServerCaPublicKey,
      instanceRelaySshServerCaPrivateKey
    };
  };

  const $getOrgCAs = async (orgId: string) => {
    const instanceCAs = await $getInstanceCAs();
    const { encryptor: orgKmsEncryptor, decryptor: orgKmsDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const orgRelayConfig = await orgRelayConfigDAL.transaction(async (tx) => {
      const existingOrgRelayConfig = await orgRelayConfigDAL.findOne(
        {
          orgId
        },
        tx
      );

      if (existingOrgRelayConfig) {
        return existingOrgRelayConfig;
      }

      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgRelayConfigInit(orgId)]);

      const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
      const orgRelayCaCert = new x509.X509Certificate(instanceCAs.orgRelayPkiCaCertificate);
      const rootRelayCaCert = new x509.X509Certificate(instanceCAs.rootRelayPkiCaCertificate);
      const orgRelayCaSkObj = crypto.nativeCrypto.createPrivateKey({
        key: instanceCAs.orgRelayPkiCaPrivateKey,
        format: "der",
        type: "pkcs8"
      });
      const orgRelayCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
        "pkcs8",
        orgRelayCaSkObj.export({ format: "der", type: "pkcs8" }),
        alg,
        true,
        ["sign"]
      );

      // generate org relay client CA
      const orgRelayClientCaSerialNumber = createSerialNumber();
      const orgRelayClientCaIssuedAt = new Date();
      const orgRelayClientCaExpiration = new Date(new Date().setFullYear(2045));
      const orgRelayClientCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const orgRelayClientCaSkObj = crypto.nativeCrypto.KeyObject.from(orgRelayClientCaKeys.privateKey);
      const orgRelayClientCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: orgRelayClientCaSerialNumber,
        subject: `O=${orgId},CN=Infisical Org Relay Client CA`,
        issuer: orgRelayCaCert.subject,
        notBefore: orgRelayClientCaIssuedAt,
        notAfter: orgRelayClientCaExpiration,
        signingKey: orgRelayCaPrivateKey,
        publicKey: orgRelayClientCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(orgRelayCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(orgRelayClientCaKeys.publicKey)
        ]
      });
      const orgRelayClientCaChain = constructPemChainFromCerts([orgRelayCaCert, rootRelayCaCert]);

      // generate org SSH CA
      const orgSshServerCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);
      const orgSshClientCaKeyPair = await createSshKeyPair(SshCertKeyAlgorithm.RSA_2048);

      // generate org relay server CA
      const orgRelayServerCaSerialNumber = createSerialNumber();
      const orgRelayServerCaIssuedAt = new Date();
      const orgRelayServerCaExpiration = new Date(new Date().setFullYear(2045));
      const orgRelayServerCaKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
      const orgRelayServerCaSkObj = crypto.nativeCrypto.KeyObject.from(orgRelayServerCaKeys.privateKey);
      const orgRelayServerCaCert = await x509.X509CertificateGenerator.create({
        serialNumber: orgRelayServerCaSerialNumber,
        subject: `O=${orgId},CN=Infisical Org Relay Server CA`,
        issuer: orgRelayCaCert.subject,
        notBefore: orgRelayServerCaIssuedAt,
        notAfter: orgRelayServerCaExpiration,
        signingKey: orgRelayCaPrivateKey,
        publicKey: orgRelayServerCaKeys.publicKey,
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
          await x509.AuthorityKeyIdentifierExtension.create(orgRelayCaCert, false),
          await x509.SubjectKeyIdentifierExtension.create(orgRelayServerCaKeys.publicKey)
        ]
      });
      const orgRelayServerCaChain = constructPemChainFromCerts([orgRelayCaCert, rootRelayCaCert]);

      const encryptedRelayPkiClientCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(
          orgRelayClientCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      }).cipherTextBlob;
      const encryptedRelayPkiClientCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(orgRelayClientCaCert.rawData)
      }).cipherTextBlob;

      const encryptedRelayPkiClientCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(orgRelayClientCaChain)
      }).cipherTextBlob;

      const encryptedRelayPkiServerCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(
          orgRelayServerCaSkObj.export({
            type: "pkcs8",
            format: "der"
          })
        )
      }).cipherTextBlob;
      const encryptedRelayPkiServerCaCertificate = orgKmsEncryptor({
        plainText: Buffer.from(orgRelayServerCaCert.rawData)
      }).cipherTextBlob;
      const encryptedRelayPkiServerCaCertificateChain = orgKmsEncryptor({
        plainText: Buffer.from(orgRelayServerCaChain)
      }).cipherTextBlob;

      const encryptedRelaySshClientCaPublicKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshClientCaKeyPair.publicKey)
      }).cipherTextBlob;
      const encryptedRelaySshClientCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshClientCaKeyPair.privateKey)
      }).cipherTextBlob;

      const encryptedRelaySshServerCaPublicKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshServerCaKeyPair.publicKey)
      }).cipherTextBlob;
      const encryptedRelaySshServerCaPrivateKey = orgKmsEncryptor({
        plainText: Buffer.from(orgSshServerCaKeyPair.privateKey)
      }).cipherTextBlob;

      return orgRelayConfigDAL.create({
        orgId,
        encryptedRelayPkiClientCaPrivateKey,
        encryptedRelayPkiClientCaCertificate,
        encryptedRelayPkiClientCaCertificateChain,
        encryptedRelayPkiServerCaPrivateKey,
        encryptedRelayPkiServerCaCertificate,
        encryptedRelayPkiServerCaCertificateChain,
        encryptedRelaySshClientCaPublicKey,
        encryptedRelaySshClientCaPrivateKey,
        encryptedRelaySshServerCaPublicKey,
        encryptedRelaySshServerCaPrivateKey
      });
    });

    const relayPkiClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelayPkiClientCaPrivateKey
    });
    const relayPkiClientCaCertificate = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelayPkiClientCaCertificate
    });
    const relayPkiClientCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelayPkiClientCaCertificateChain
    });

    const relayPkiServerCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelayPkiServerCaPrivateKey
    });
    const relayPkiServerCaCertificate = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelayPkiServerCaCertificate
    });
    const relayPkiServerCaCertificateChain = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelayPkiServerCaCertificateChain
    });

    const relaySshClientCaPublicKey = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelaySshClientCaPublicKey
    });
    const relaySshClientCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelaySshClientCaPrivateKey
    });

    const relaySshServerCaPublicKey = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelaySshServerCaPublicKey
    });
    const relaySshServerCaPrivateKey = orgKmsDecryptor({
      cipherTextBlob: orgRelayConfig.encryptedRelaySshServerCaPrivateKey
    });

    return {
      relayPkiClientCaPrivateKey,
      relayPkiClientCaCertificate,
      relayPkiClientCaCertificateChain,
      relayPkiServerCaPrivateKey,
      relayPkiServerCaCertificate,
      relayPkiServerCaCertificateChain,
      relaySshClientCaPublicKey,
      relaySshClientCaPrivateKey,
      relaySshServerCaPublicKey,
      relaySshServerCaPrivateKey
    };
  };

  const $generateRelayServerCredentials = async ({
    host,
    orgId,
    relayPkiServerCaCertificate,
    relayPkiServerCaPrivateKey,
    relayPkiClientCaCertificate,
    relayPkiClientCaCertificateChain,
    relaySshClientCaPublicKey,
    relaySshServerCaPrivateKey
  }: {
    host: string;
    relayPkiServerCaCertificate: Buffer;
    relayPkiServerCaPrivateKey: Buffer;
    relayPkiClientCaCertificateChain: Buffer;
    relayPkiClientCaCertificate: Buffer;
    relaySshServerCaPrivateKey: Buffer;
    relaySshClientCaPublicKey: Buffer;
    orgId?: string;
  }) => {
    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const relayServerCaCert = new x509.X509Certificate(relayPkiServerCaCertificate);
    const relayClientCaCert = new x509.X509Certificate(relayPkiClientCaCertificate);
    const relayServerCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: relayPkiServerCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const relayServerCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      relayServerCaSkObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const relayServerKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const relayServerCertIssuedAt = new Date();
    const relayServerCertExpireAt = new Date(new Date().setDate(new Date().getDate() + 1));
    const relayServerCertPrivateKey = crypto.nativeCrypto.KeyObject.from(relayServerKeys.privateKey);

    const relayServerCertExtensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(relayServerCaCert, false),
      await x509.SubjectKeyIdentifierExtension.create(relayServerKeys.publicKey),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]), // anyPolicy
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags[CertKeyUsage.DIGITAL_SIGNATURE] | x509.KeyUsageFlags[CertKeyUsage.KEY_ENCIPHERMENT],
        true
      ),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage[CertExtendedKeyUsage.SERVER_AUTH]], true),
      // san
      new x509.SubjectAlternativeNameExtension([{ type: "ip", value: host }], false)
    ];

    const relayServerSerialNumber = createSerialNumber();
    const relayServerCertificate = await x509.X509CertificateGenerator.create({
      serialNumber: relayServerSerialNumber,
      subject: `CN=${host},O=${orgId ?? "Infisical"},OU=Relay`,
      issuer: relayServerCaCert.subject,
      notBefore: relayServerCertIssuedAt,
      notAfter: relayServerCertExpireAt,
      signingKey: relayServerCaPrivateKey,
      publicKey: relayServerKeys.publicKey,
      signingAlgorithm: alg,
      extensions: relayServerCertExtensions
    });

    // generate relay server SSH certificate
    const keyAlgorithm = SshCertKeyAlgorithm.RSA_2048;
    const { publicKey: relayServerSshPublicKey, privateKey: relayServerSshPrivateKey } =
      await createSshKeyPair(keyAlgorithm);

    const relayServerSshCert = await createSshCert({
      caPrivateKey: relaySshServerCaPrivateKey.toString("utf8"),
      clientPublicKey: relayServerSshPublicKey,
      keyId: "relay-server",
      principals: [`${host}:2222`],
      certType: SshCertType.HOST,
      requestedTtl: "30d"
    });

    return {
      pki: {
        serverCertificate: relayServerCertificate.toString("pem"),
        serverPrivateKey: relayServerCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
        clientCertificateChain: prependCertToPemChain(
          relayClientCaCert,
          relayPkiClientCaCertificateChain.toString("utf8")
        )
      },
      ssh: {
        serverCertificate: relayServerSshCert.signedPublicKey,
        serverPrivateKey: relayServerSshPrivateKey,
        clientCAPublicKey: relaySshClientCaPublicKey.toString("utf8")
      }
    };
  };

  const $generateRelayClientCredentials = async ({
    gatewayId,
    orgId,
    orgName,
    relayPkiClientCaCertificate,
    relayPkiClientCaPrivateKey,
    relayPkiServerCaCertificate,
    relayPkiServerCaCertificateChain
  }: {
    gatewayId: string;
    orgId: string;
    orgName: string;
    relayPkiClientCaCertificate: Buffer;
    relayPkiClientCaPrivateKey: Buffer;
    relayPkiServerCaCertificate: Buffer;
    relayPkiServerCaCertificateChain: Buffer;
  }) => {
    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const relayClientCaCert = new x509.X509Certificate(relayPkiClientCaCertificate);
    const relayServerCaCert = new x509.X509Certificate(relayPkiServerCaCertificate);
    const relayClientCaSkObj = crypto.nativeCrypto.createPrivateKey({
      key: relayPkiClientCaPrivateKey,
      format: "der",
      type: "pkcs8"
    });

    const importedRelayClientCaPrivateKey = await crypto.nativeCrypto.subtle.importKey(
      "pkcs8",
      relayClientCaSkObj.export({ format: "der", type: "pkcs8" }),
      alg,
      true,
      ["sign"]
    );

    const clientCertIssuedAt = new Date();
    const clientCertExpiration = new Date(new Date().getTime() + 5 * 60 * 1000);
    const clientKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const clientCertPrivateKey = crypto.nativeCrypto.KeyObject.from(clientKeys.privateKey);
    const clientCertSerialNumber = createSerialNumber();

    // Build standard extensions
    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(relayClientCaCert, false),
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
    ];

    const clientCert = await x509.X509CertificateGenerator.create({
      serialNumber: clientCertSerialNumber,
      subject: `O=${orgName}-${orgId},OU=relay-client,CN=${gatewayId}`,
      issuer: relayClientCaCert.subject,
      notAfter: clientCertExpiration,
      notBefore: clientCertIssuedAt,
      signingKey: importedRelayClientCaPrivateKey,
      publicKey: clientKeys.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    return {
      clientCertificate: clientCert.toString("pem"),
      clientPrivateKey: clientCertPrivateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      serverCertificateChain: prependCertToPemChain(
        relayServerCaCert,
        relayPkiServerCaCertificateChain.toString("utf8")
      )
    };
  };

  const getCredentialsForGateway = async ({
    relayName,
    orgId,
    gatewayId
  }: {
    relayName: string;
    orgId: string;
    gatewayId: string;
  }) => {
    let relay: TRelays | null = await relayDAL.findOne({
      orgId,
      name: relayName
    });

    if (!relay) {
      relay = await relayDAL.findOne({
        name: relayName,
        orgId: null
      });
    }

    if (!relay) {
      throw new NotFoundError({
        message: "Relay not found"
      });
    }

    const keyAlgorithm = SshCertKeyAlgorithm.RSA_2048;
    const { publicKey: relayClientSshPublicKey, privateKey: relayClientSshPrivateKey } =
      await createSshKeyPair(keyAlgorithm);

    if (relay.orgId === null) {
      const instanceCAs = await $getInstanceCAs();
      const relayClientSshCert = await createSshCert({
        caPrivateKey: instanceCAs.instanceRelaySshClientCaPrivateKey.toString("utf8"),
        clientPublicKey: relayClientSshPublicKey,
        keyId: `client-${relayName}`,
        principals: [gatewayId],
        certType: SshCertType.USER,
        requestedTtl: "1d"
      });

      return {
        relayHost: relay.host,
        clientSshCert: relayClientSshCert.signedPublicKey,
        clientSshPrivateKey: relayClientSshPrivateKey,
        serverCAPublicKey: instanceCAs.instanceRelaySshServerCaPublicKey.toString("utf8")
      };
    }

    const orgCAs = await $getOrgCAs(orgId);
    const relayClientSshCert = await createSshCert({
      caPrivateKey: orgCAs.relaySshClientCaPrivateKey.toString("utf8"),
      clientPublicKey: relayClientSshPublicKey,
      keyId: `relay-client-${relay.id}`,
      principals: [gatewayId],
      certType: SshCertType.USER,
      requestedTtl: "30d"
    });

    return {
      relayHost: relay.host,
      clientSshCert: relayClientSshCert.signedPublicKey,
      clientSshPrivateKey: relayClientSshPrivateKey,
      serverCAPublicKey: orgCAs.relaySshServerCaPublicKey.toString("utf8")
    };
  };

  const getCredentialsForClient = async ({
    relayId,
    orgId,
    orgName,
    gatewayId
  }: {
    relayId: string;
    orgId: string;
    orgName: string;
    gatewayId: string;
  }) => {
    const relay = await relayDAL.findOne({
      id: relayId
    });

    if (!relay) {
      throw new NotFoundError({
        message: "Relay not found"
      });
    }

    await verifyHostInputValidity(relay.host);

    if (relay.orgId === null) {
      const instanceCAs = await $getInstanceCAs();
      const relayCertificateCredentials = await $generateRelayClientCredentials({
        gatewayId,
        orgId,
        orgName,
        relayPkiClientCaCertificate: instanceCAs.instanceRelayPkiClientCaCertificate,
        relayPkiClientCaPrivateKey: instanceCAs.instanceRelayPkiClientCaPrivateKey,
        relayPkiServerCaCertificate: instanceCAs.instanceRelayPkiServerCaCertificate,
        relayPkiServerCaCertificateChain: instanceCAs.instanceRelayPkiServerCaCertificateChain
      });

      return {
        ...relayCertificateCredentials,
        relayHost: relay.host
      };
    }

    const orgCAs = await $getOrgCAs(orgId);
    const relayCertificateCredentials = await $generateRelayClientCredentials({
      gatewayId,
      orgId,
      orgName,
      relayPkiClientCaCertificate: orgCAs.relayPkiClientCaCertificate,
      relayPkiClientCaPrivateKey: orgCAs.relayPkiClientCaPrivateKey,
      relayPkiServerCaCertificate: orgCAs.relayPkiServerCaCertificate,
      relayPkiServerCaCertificateChain: orgCAs.relayPkiServerCaCertificateChain
    });

    return {
      ...relayCertificateCredentials,
      relayHost: relay.host
    };
  };

  const registerRelay = async ({
    host,
    name,
    identityId,
    orgId
  }: {
    host: string;
    name: string;
    identityId?: string;
    orgId?: string;
  }) => {
    let relay: TRelays;
    const isOrgRelay = identityId && orgId;

    await verifyHostInputValidity(host);

    if (isOrgRelay) {
      relay = await relayDAL.transaction(async (tx) => {
        const existingRelay = await relayDAL.findOne(
          {
            identityId,
            orgId
          },
          tx
        );

        if (existingRelay && (existingRelay.host !== host || existingRelay.name !== name)) {
          return relayDAL.updateById(existingRelay.id, { host, name }, tx);
        }

        if (!existingRelay) {
          return relayDAL.create(
            {
              host,
              name,
              identityId,
              orgId
            },
            tx
          );
        }

        return existingRelay;
      });
    } else {
      relay = await relayDAL.transaction(async (tx) => {
        const existingRelay = await relayDAL.findOne(
          {
            name,
            orgId: null
          },
          tx
        );

        if (existingRelay && existingRelay.host !== host) {
          return relayDAL.updateById(existingRelay.id, { host }, tx);
        }

        if (!existingRelay) {
          return relayDAL.create(
            {
              host,
              name
            },
            tx
          );
        }

        return existingRelay;
      });
    }

    if (relay.orgId === null) {
      const instanceCAs = await $getInstanceCAs();
      return $generateRelayServerCredentials({
        host,
        relayPkiServerCaCertificate: instanceCAs.instanceRelayPkiServerCaCertificate,
        relayPkiServerCaPrivateKey: instanceCAs.instanceRelayPkiServerCaPrivateKey,
        relayPkiClientCaCertificate: instanceCAs.instanceRelayPkiClientCaCertificate,
        relayPkiClientCaCertificateChain: instanceCAs.instanceRelayPkiClientCaCertificateChain,
        relaySshServerCaPrivateKey: instanceCAs.instanceRelaySshServerCaPrivateKey,
        relaySshClientCaPublicKey: instanceCAs.instanceRelaySshClientCaPublicKey
      });
    }

    if (relay.orgId) {
      const orgCAs = await $getOrgCAs(relay.orgId);
      return $generateRelayServerCredentials({
        host,
        orgId: relay.orgId,
        relayPkiServerCaCertificate: orgCAs.relayPkiServerCaCertificate,
        relayPkiServerCaPrivateKey: orgCAs.relayPkiServerCaPrivateKey,
        relayPkiClientCaCertificate: orgCAs.relayPkiClientCaCertificate,
        relayPkiClientCaCertificateChain: orgCAs.relayPkiClientCaCertificateChain,
        relaySshServerCaPrivateKey: orgCAs.relaySshServerCaPrivateKey,
        relaySshClientCaPublicKey: orgCAs.relaySshClientCaPublicKey
      });
    }

    throw new BadRequestError({
      message: "Unhandled relay type"
    });
  };

  return {
    registerRelay,
    getCredentialsForGateway,
    getCredentialsForClient
  };
};
