import { execFileSync } from "node:child_process";
import { webcrypto } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as x509 from "@peculiar/x509";

import { crypto } from "@app/lib/crypto/cryptography";
import { initializePqcSupport } from "@app/lib/crypto/pqc";
import {
  opensslDerivePublicKey,
  opensslGenpkey,
  opensslSign,
  verifyPqcOpenSSLAvailability
} from "@app/lib/crypto/pqc/pqc-openssl";
import { BadRequestError } from "@app/lib/errors";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { hsmCaKeySourceFactory } from "./hsm-ca-key-source";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const PQC_OPENSSL_BIN = process.env.PQC_OPENSSL_BIN_PATH || "/opt/openssl-pqc/bin/openssl";
const PQC_OPENSSL_LIB = process.env.PQC_OPENSSL_LIB_PATH || "/opt/openssl-pqc/lib64:/opt/openssl-pqc/lib";

const runPqcOpenssl = (args: (dir: string) => string[], files: Record<string, Buffer | string>) => {
  const dir = mkdtempSync(join(tmpdir(), "hsm-ca-"));
  try {
    Object.entries(files).forEach(([name, content]) => writeFileSync(join(dir, name), content));
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("OPENSSL_")));
    return execFileSync(PQC_OPENSSL_BIN, args(dir), {
      env: { ...env, LD_LIBRARY_PATH: [PQC_OPENSSL_LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") }
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

type TSignCall = { mechanism: string; isDigest: boolean; data: Buffer };

const fakeMlDsaHsm = async (algorithm: string) => {
  const privateKeyDer = await opensslGenpkey(algorithm);
  const publicKeySpkiDer = await opensslDerivePublicKey(privateKeyDer);
  const generateCalls: Record<string, unknown>[] = [];
  const signCalls: TSignCall[] = [];
  const hsmConnectorService = {
    assertAttachPermission: vi.fn(),
    generateKeyPair: vi.fn(async (args: Record<string, unknown>) => {
      generateCalls.push(args);
      return { keyLabel: "ca-root-abcde", keyId: "0a0b", publicKeySpkiDer };
    }),
    sign: vi.fn(async ({ mechanism, isDigest, data }: TSignCall) => {
      signCalls.push({ mechanism, isDigest, data });
      return opensslSign(privateKeyDer, data);
    })
  };
  return { hsmConnectorService, generateCalls, signCalls };
};

describe("HSM CA key source", () => {
  let isOpensslAvailable = false;

  beforeAll(async () => {
    await crypto.initialize({} as never, {} as never, {} as never);
    isOpensslAvailable = await verifyPqcOpenSSLAvailability();
  });

  test("explains an ML-DSA key the Gateway or HSM cannot create", async () => {
    const provider = hsmCaKeySourceFactory({
      hsmConnectorService: {
        generateKeyPair: vi.fn(async () => {
          throw new BadRequestError({
            message: "PKCS#11 request failed (mechanism_invalid): Mechanism not supported by this HSM"
          });
        })
      } as never,
      hsmConnectorDAL: { findById: vi.fn() } as never
    });

    await expect(
      provider.createKey({
        projectId: "project",
        caName: "root",
        keyAlgorithm: CertKeyAlgorithm.ML_DSA_44,
        input: { hsmConnectorId: "connector" }
      })
    ).rejects.toThrow(/slot does not support ML-DSA-44 keys/);
  });

  test("ML-DSA certificates signed through the HSM with CKM_ML_DSA verify against the HSM public key", async ({
    skip
  }) => {
    if (!isOpensslAvailable) skip();
    await initializePqcSupport();
    try {
      const { hsmConnectorService, generateCalls, signCalls } = await fakeMlDsaHsm("ML-DSA-65");
      const provider = hsmCaKeySourceFactory({
        hsmConnectorService: hsmConnectorService as never,
        hsmConnectorDAL: { findById: vi.fn() } as never
      });

      const reference = await provider.createKey({
        projectId: "project",
        caName: "root",
        keyAlgorithm: CertKeyAlgorithm.ML_DSA_65,
        input: { hsmConnectorId: "connector" }
      });
      const signer = await provider.buildSigner({
        projectId: "project",
        keyAlgorithm: CertKeyAlgorithm.ML_DSA_65,
        reference
      });
      const certificate = await signer.createCertificate({
        subject: "CN=Root CA",
        issuer: "CN=Root CA",
        serialNumber: "01",
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 86_400_000),
        publicKey: signer.caPublicKey
      });

      expect(generateCalls[0]).toMatchObject({ keyAlgorithm: "ML_DSA_65" });
      expect(signCalls[0]).toMatchObject({ mechanism: "CKM_ML_DSA", isDigest: false });
      const verified = runPqcOpenssl(
        (dir) => ["verify", "-check_ss_sig", "-CAfile", join(dir, "cert.pem"), join(dir, "cert.pem")],
        { "cert.pem": certificate.toString("pem") }
      ).toString();
      expect(verified).toContain("OK");
    } finally {
      x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    }
  });
});
