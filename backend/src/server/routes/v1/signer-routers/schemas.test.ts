import { describe, expect, test } from "vitest";
import { z } from "zod";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { CertKeySource } from "@app/services/signer/signer-enums";
import { assertExternalConfigurationMatchesCaType } from "@app/services/signer/signer-service";

import {
  refineSignerCertificateInput,
  SignerCertificateInputSchema,
  SignerExternalConfigurationSchema,
  SignerKeyAlgorithm
} from "./schemas";

describe("SignerExternalConfigurationSchema", () => {
  test("keeps fields that belong to another CA type so the service can reject them", () => {
    expect(
      SignerExternalConfigurationSchema.parse({
        caType: CaType.DIGICERT,
        reissueFromExternalOrderId: "1",
        template: "x"
      })
    ).toEqual({ caType: CaType.DIGICERT, reissueFromExternalOrderId: "1", template: "x" });
  });
});

describe("assertExternalConfigurationMatchesCaType", () => {
  test("accepts a matching or omitted caType", () => {
    expect(() => assertExternalConfigurationMatchesCaType({ caType: CaType.DIGICERT }, CaType.DIGICERT)).not.toThrow();
    expect(() => assertExternalConfigurationMatchesCaType({ template: "x" }, CaType.ADCS)).not.toThrow();
    expect(() => assertExternalConfigurationMatchesCaType(undefined, null)).not.toThrow();
  });

  test("rejects a caType that does not match the certificate authority", () => {
    expect(() => assertExternalConfigurationMatchesCaType({ caType: CaType.ADCS }, CaType.DIGICERT)).toThrow(
      "does not match the type of the selected certificate authority"
    );
    expect(() => assertExternalConfigurationMatchesCaType({ caType: CaType.DIGICERT }, CaType.INTERNAL)).toThrow(
      "does not match"
    );
  });
});

describe("refineSignerCertificateInput", () => {
  const BodySchema = z
    .object({
      commonName: z.string().optional(),
      certificateTtlDays: z.number().optional(),
      keyAlgorithm: SignerKeyAlgorithm.schema.optional(),
      certificate: SignerCertificateInputSchema.optional(),
      externalConfiguration: SignerExternalConfigurationSchema.optional()
    })
    .superRefine(refineSignerCertificateInput);
  const importBody = {
    certificate: {
      keySource: CertKeySource.Hsm,
      hsmConnectorId: "00000000-0000-4000-8000-000000000000",
      hsmKeyLabel: "example-key"
    },
    externalConfiguration: { importFromExternalOrderId: "123" }
  };
  const issuePaths = (body: unknown) => {
    const result = BodySchema.safeParse(body);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
  };

  test("accepts an import with an HSM connector and key label", () => {
    expect(issuePaths(importBody)).toEqual([]);
  });

  test("rejects values that come from the imported certificate", () => {
    expect(
      issuePaths({ ...importBody, commonName: "x", certificateTtlDays: 30, keyAlgorithm: CertKeyAlgorithm.RSA_4096 })
    ).toEqual(["commonName", "certificateTtlDays", "keyAlgorithm"]);
  });

  test("requires a key label for an import and rejects one without an import", () => {
    expect(issuePaths({ ...importBody, certificate: { ...importBody.certificate, hsmKeyLabel: undefined } })).toEqual([
      "certificate.hsmKeyLabel"
    ]);
    expect(issuePaths({ certificate: importBody.certificate, keyAlgorithm: CertKeyAlgorithm.RSA_4096 })).toEqual([
      "certificate.hsmKeyLabel"
    ]);
  });

  test("rejects a key label longer than the 128-character column", () => {
    expect(
      issuePaths({ ...importBody, certificate: { ...importBody.certificate, hsmKeyLabel: "k".repeat(129) } })
    ).toEqual(["certificate.hsmKeyLabel"]);
  });

  test("accepts a hex key ID with an import and normalizes it to lowercase", () => {
    const result = BodySchema.safeParse({
      ...importBody,
      certificate: { ...importBody.certificate, hsmKeyId: "0A1B" }
    });
    expect(result.success && result.data.certificate?.hsmKeyId).toBe("0a1b");
  });

  test("rejects a key ID that is not hex bytes or is sent without an import", () => {
    expect(issuePaths({ ...importBody, certificate: { ...importBody.certificate, hsmKeyId: "abc" } })).toEqual([
      "certificate.hsmKeyId"
    ]);
    expect(
      issuePaths({
        certificate: {
          keySource: CertKeySource.Hsm,
          hsmConnectorId: importBody.certificate.hsmConnectorId,
          hsmKeyId: "0a"
        },
        keyAlgorithm: CertKeyAlgorithm.RSA_4096
      })
    ).toEqual(["certificate.hsmKeyId"]);
  });
});
