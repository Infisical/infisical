import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { THsmConnectorDALFactory } from "@app/services/hsm-connector/hsm-connector-dal";
import { THsmConnectorServiceFactory } from "@app/services/hsm-connector/hsm-connector-service";

import { buildHsmCaSigner, caKeyAlgorithmToHsmShape, createEphemeralKeyCache } from "../ca-signer";
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
      CertKeyAlgorithm.ECDSA_P384
    ],

    assertCanUse: async ({ actor, projectId, input }) => {
      await hsmConnectorService.assertAttachPermission(actor, requireHsmConnectorId(input), projectId);
    },

    createKey: async ({ projectId, caName, keyAlgorithm, input }) => {
      const hsmConnectorId = requireHsmConnectorId(input);
      const generated = await hsmConnectorService.generateKeyPair({
        connectorId: hsmConnectorId,
        projectId,
        keyLabel: `ca-${caName}-${alphaNumericNanoId(5)}`,
        keyAlgorithm: caKeyAlgorithmToHsmShape(keyAlgorithm).hsmKeyAlgorithm
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

      const caPublicKey = await crypto.nativeCrypto.subtle.importKey(
        "spki",
        publicKeySpki,
        caKeyAlgorithmToHsmShape(keyAlgorithm).importParams,
        true,
        ["verify"]
      );

      return buildHsmCaSigner({
        caPublicKey,
        keyAlgorithm,
        signingAlgorithm: signatureAlgorithm,
        sign: (data, mechanism, isDigest) =>
          hsmConnectorService.sign({
            connectorId: hsmConnectorId,
            projectId,
            keyLabel,
            keyId: hsmKeyId,
            publicKeySpki,
            mechanism,
            data,
            isDigest
          }),
        ephemeralKeys
      });
    }
  };
};
