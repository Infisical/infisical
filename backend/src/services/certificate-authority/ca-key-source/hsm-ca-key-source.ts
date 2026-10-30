import { crypto } from "@app/lib/crypto/cryptography";
import { isPqcAlgorithm } from "@app/lib/crypto/pqc";
import { bufferToArrayBuffer, Pkcs11Mechanism } from "@app/lib/csr/pkcs11-algorithm-map";
import { BadRequestError } from "@app/lib/errors";
import { asNonSharedBuffer } from "@app/lib/fn";
import { isPkcs11Error, Pkcs11ErrorCode } from "@app/lib/gateway-v2/pkcs11-rpc";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { THsmConnectorDALFactory } from "@app/services/hsm-connector/hsm-connector-dal";
import { certKeyAlgorithmToHsmKeyAlgorithm } from "@app/services/hsm-connector/hsm-connector-fns";
import { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";

import {
  buildHsmCaSigner,
  buildPqcExternalCaSigner,
  caKeyAlgorithmToHsmShape,
  createEphemeralKeyCache
} from "../ca-signer";
import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TExternalCaKeyInput, TExternalCaKeyProvider } from "./ca-key-source-types";

type THsmCaKeySourceDep = {
  hsmConnectorService: Pick<THsmConnectorServiceFactory, "generateKeyPair" | "sign" | "assertAttachPermission">;
  hsmConnectorDAL: Pick<THsmConnectorDALFactory, "findById">;
};

const requireHsmConnectorId = (input: TExternalCaKeyInput) => {
  if (!input.hsmConnectorId) {
    throw new BadRequestError({ message: "An HSM Connector is required when the key source is HSM." });
  }
  return input.hsmConnectorId;
};

export const hsmCaKeySourceFactory = ({
  hsmConnectorService,
  hsmConnectorDAL
}: THsmCaKeySourceDep): TExternalCaKeyProvider => {
  const ephemeralKeys = createEphemeralKeyCache();

  return {
    displayName: "HSM",
    supportedKeyAlgorithms: [
      CertKeyAlgorithm.RSA_2048,
      CertKeyAlgorithm.RSA_4096,
      CertKeyAlgorithm.ECDSA_P256,
      CertKeyAlgorithm.ECDSA_P384,
      CertKeyAlgorithm.ML_DSA_44,
      CertKeyAlgorithm.ML_DSA_65,
      CertKeyAlgorithm.ML_DSA_87
    ],

    assertCanUse: async ({ actor, projectId, input }) => {
      await hsmConnectorService.assertAttachPermission(actor, requireHsmConnectorId(input), projectId);
    },

    createKey: async ({ projectId, caName, keyAlgorithm, input }) => {
      const hsmConnectorId = requireHsmConnectorId(input);
      const hsmKeyAlgorithm = certKeyAlgorithmToHsmKeyAlgorithm(keyAlgorithm);
      if (!hsmKeyAlgorithm) {
        throw new BadRequestError({
          message: `Key algorithm "${keyAlgorithm}" is not supported for HSM-backed certificate authorities.`
        });
      }
      const generated = await hsmConnectorService
        .generateKeyPair({
          connectorId: hsmConnectorId,
          projectId,
          keyLabel: `ca-${caName}-${alphaNumericNanoId(5)}`,
          keyAlgorithm: hsmKeyAlgorithm
        })
        .catch((err: unknown) => {
          if (isPqcAlgorithm(keyAlgorithm) && isPkcs11Error(err, Pkcs11ErrorCode.MechanismInvalid)) {
            throw new BadRequestError({
              message: `The HSM Connector's slot does not support ${keyAlgorithm} keys. Check that your HSM's PKCS#11 driver supports ML-DSA on this slot.`
            });
          }
          throw err;
        });
      return {
        hsmConnectorId,
        externalKeyId: generated.keyLabel,
        hsmKeyId: generated.keyId,
        publicKeySpki: generated.publicKeySpkiDer
      };
    },

    describeKey: async ({ reference }) => {
      const hsmConnector = reference.hsmConnectorId
        ? await hsmConnectorDAL.findById(reference.hsmConnectorId)
        : undefined;
      return {
        hsmConnectorId: reference.hsmConnectorId ?? undefined,
        hsmConnectorName: hsmConnector?.name,
        hsmKeyLabel: reference.externalKeyId ?? undefined,
        externalKeyId: reference.externalKeyId ?? undefined
      };
    },

    buildSigner: async ({ projectId, keyAlgorithm, reference, signatureAlgorithm }) => {
      const { hsmConnectorId, externalKeyId: keyLabel, hsmKeyId, publicKeySpki } = reference;
      if (!hsmConnectorId || !keyLabel || !publicKeySpki) {
        throw new BadRequestError({
          message: "HSM-backed CA secret is missing its connector, key label, or public key"
        });
      }

      const hsmSign = (data: Buffer, mechanism: string, isDigest: boolean) =>
        hsmConnectorService.sign({
          connectorId: hsmConnectorId,
          projectId,
          keyLabel,
          keyId: hsmKeyId,
          publicKeySpki,
          mechanism,
          data,
          isDigest
        });

      if (isPqcAlgorithm(keyAlgorithm)) {
        return buildPqcExternalCaSigner({
          keyAlgCfg: keyAlgorithmToAlgCfg(keyAlgorithm),
          publicKeySpki,
          ephemeralKeys,
          signTbs: async (tbs) => bufferToArrayBuffer(await hsmSign(tbs, Pkcs11Mechanism.MlDsa, false))
        });
      }

      const caPublicKey = await crypto.nativeCrypto.subtle.importKey(
        "spki",
        asNonSharedBuffer(publicKeySpki),
        caKeyAlgorithmToHsmShape(keyAlgorithm).importParams,
        true,
        ["verify"]
      );

      return buildHsmCaSigner({
        caPublicKey,
        keyAlgorithm,
        signingAlgorithm: signatureAlgorithm,
        sign: hsmSign,
        ephemeralKeys
      });
    }
  };
};
