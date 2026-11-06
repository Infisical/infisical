import { execFileSync } from "node:child_process";
import nodeCrypto, { KeyObject, webcrypto } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CreateAliasCommand,
  CreateAliasCommandInput,
  CreateKeyCommand,
  GetPublicKeyCommand,
  KMSClient,
  ScheduleKeyDeletionCommand,
  SignCommand
} from "@aws-sdk/client-kms";
import { AsnConvert } from "@peculiar/asn1-schema";
import { Certificate } from "@peculiar/asn1-x509";
import * as x509 from "@peculiar/x509";

import { ProjectType } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";
import { initializePqcSupport } from "@app/lib/crypto/pqc";
import { opensslDerivePublicKey, opensslGenpkey, verifyPqcOpenSSLAvailability } from "@app/lib/crypto/pqc/pqc-openssl";
import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { wrapRsaPkcs1DigestInfo } from "@app/lib/csr/pkcs11-algorithm-map";
import { BadRequestError } from "@app/lib/errors";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { CertKeySource } from "@app/services/signer/signer-enums";

import { awsKmsCaKeySourceFactory } from "./aws-kms-ca-key-source";
import { caKeySourceServiceFactory } from "./ca-key-source-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: vi.fn(async (connection: unknown) => connection)
}));

vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn(async (_connection: unknown, region: string) => ({
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    region
  }))
}));

const KEY_ARN = "arn:aws:kms:us-east-1:111122223333:key/0b7fd7dd-bac6-4ef2-8790-7413567cad8c";

type TSignInput = { Message: Uint8Array; MessageType: string; SigningAlgorithm: string };

const PQC_OPENSSL_BIN = process.env.PQC_OPENSSL_BIN_PATH || "/opt/openssl-pqc/bin/openssl";
const PQC_OPENSSL_LIB = process.env.PQC_OPENSSL_LIB_PATH || "/opt/openssl-pqc/lib64:/opt/openssl-pqc/lib";

const opensslPkeySign = (privateKeyDer: Buffer, input: Buffer, pkeyOpts: string[] = []) => {
  const dir = mkdtempSync(join(tmpdir(), "kms-fake-"));
  try {
    writeFileSync(join(dir, "key.der"), privateKeyDer);
    writeFileSync(join(dir, "input.bin"), input);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("OPENSSL_")));
    return execFileSync(
      PQC_OPENSSL_BIN,
      [
        "pkeyutl",
        "-sign",
        "-inkey",
        join(dir, "key.der"),
        "-keyform",
        "DER",
        "-in",
        join(dir, "input.bin"),
        ...pkeyOpts.flatMap((opt) => ["-pkeyopt", opt])
      ],
      { env: { ...env, LD_LIBRARY_PATH: [PQC_OPENSSL_LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") } }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const fakeKms = ({ publicKeySpki, sign }: { publicKeySpki: Buffer; sign: (input: TSignInput) => Buffer }) => {
  const signCalls: TSignInput[] = [];
  const createCalls: Record<string, unknown>[] = [];
  const aliasCalls: CreateAliasCommandInput[] = [];

  const send = async (command: unknown) => {
    if (command instanceof CreateKeyCommand) {
      createCalls.push(command.input as Record<string, unknown>);
      return { KeyMetadata: { Arn: KEY_ARN } };
    }
    if (command instanceof GetPublicKeyCommand) {
      return { PublicKey: publicKeySpki };
    }
    if (command instanceof CreateAliasCommand) {
      aliasCalls.push(command.input);
      return {};
    }
    if (command instanceof SignCommand) {
      const input = command.input as TSignInput;
      signCalls.push(input);
      return { Signature: sign(input) };
    }
    throw new Error("unexpected KMS command");
  };
  vi.spyOn(KMSClient.prototype, "send").mockImplementation(send as never);

  return { signCalls, createCalls, aliasCalls, publicKeySpki };
};

const spkiOf = (publicKey: KeyObject) => publicKey.export({ format: "der", type: "spki" });

const rsaKms = () => {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return fakeKms({
    publicKeySpki: spkiOf(publicKey),
    sign: (input) =>
      nodeCrypto.privateEncrypt(
        { key: privateKey, padding: nodeCrypto.constants.RSA_PKCS1_PADDING },
        wrapRsaPkcs1DigestInfo(input.SigningAlgorithm as SigningAlgorithm, Buffer.from(input.Message))
      )
  });
};

const ecdsaKms = (namedCurve: string) => {
  const { publicKey, privateKey } = nodeCrypto.generateKeyPairSync("ec", { namedCurve });
  const privateKeyDer = privateKey.export({ format: "der", type: "pkcs8" });
  return fakeKms({
    publicKeySpki: spkiOf(publicKey),
    sign: (input) => opensslPkeySign(privateKeyDer, Buffer.from(input.Message))
  });
};

const mlDsaKms = async (algorithm: string) => {
  const privateKeyDer = await opensslGenpkey(algorithm);
  return fakeKms({
    publicKeySpki: await opensslDerivePublicKey(privateKeyDer),
    sign: (input) => opensslPkeySign(privateKeyDer, Buffer.from(input.Message), ["mu:1"])
  });
};

const opensslVerifySelfSigned = (certificate: x509.X509Certificate) => {
  const dir = mkdtempSync(join(tmpdir(), "kms-verify-"));
  try {
    const certPath = join(dir, "cert.pem");
    writeFileSync(certPath, certificate.toString("pem"));
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("OPENSSL_")));
    return execFileSync(PQC_OPENSSL_BIN, ["verify", "-check_ss_sig", "-CAfile", certPath, certPath], {
      env: { ...env, LD_LIBRARY_PATH: [PQC_OPENSSL_LIB, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":") }
    }).toString();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const buildDeps = (plan: Record<string, unknown> = { pkiAwsKmsSigning: true }) => ({
  appConnectionDAL: { findById: vi.fn(async () => ({ id: "conn", app: "aws", orgId: "org" })) } as never,
  appConnectionService: { validateAppConnectionUsageById: vi.fn() } as never,
  kmsService: {} as never,
  projectDAL: { findById: vi.fn(async () => ({ id: "project", orgId: "org" })) } as never,
  licenseService: { getPlan: vi.fn(async () => plan) } as never,
  hsmConnectorService: {} as never,
  hsmConnectorDAL: {} as never,
  certificateAuthoritySecretDAL: { findOne: vi.fn() } as never
});

const createAndSignRoot = async (keyAlgorithm: CertKeyAlgorithm, signatureAlgorithm?: Algorithm) => {
  const provider = awsKmsCaKeySourceFactory(buildDeps());
  const reference = await provider.createKey({
    projectId: "project",
    caName: "root-ca",
    keyAlgorithm,
    input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
  });
  const signer = await provider.buildSigner({ projectId: "project", keyAlgorithm, reference, signatureAlgorithm });
  const certificate = await signer.createCertificate({
    subject: "CN=Root CA",
    issuer: "CN=Root CA",
    serialNumber: "01",
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 86_400_000),
    publicKey: signer.caPublicKey
  });
  return { reference, signer, certificate };
};

describe("AWS KMS CA key source", () => {
  let isOpensslAvailable = false;

  beforeAll(async () => {
    await crypto.initialize({} as never, {} as never, {} as never);
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    isOpensslAvailable = await verifyPqcOpenSSLAvailability();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("creates a sign/verify key and stores only its reference", async () => {
    const { createCalls, publicKeySpki } = rsaKms();

    const { reference } = await createAndSignRoot(CertKeyAlgorithm.RSA_2048);

    expect(createCalls[0]).toMatchObject({ KeySpec: "RSA_2048", KeyUsage: "SIGN_VERIFY" });
    expect(reference).toEqual({ appConnectionId: "conn", externalKeyId: KEY_ARN, publicKeySpki });
    expect(getAwsConnectionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: ProjectType.CertificateManager }),
      AWSRegion.US_EAST_1
    );
  });

  test("RSA certificates and CRLs signed through KMS verify against the KMS public key", async () => {
    const { signCalls } = rsaKms();

    const { signer, certificate } = await createAndSignRoot(CertKeyAlgorithm.RSA_2048);
    const crl = await signer.createCrl({ issuer: "CN=Root CA", thisUpdate: new Date(), entries: [] });

    expect(await certificate.verify({ publicKey: signer.caPublicKey, signatureOnly: true })).toBe(true);
    expect(await crl.verify({ publicKey: signer.caPublicKey })).toBe(true);
    expect(signCalls.every((call) => call.MessageType === "DIGEST")).toBe(true);
    expect(signCalls[0].SigningAlgorithm).toBe("RSASSA_PKCS1_V1_5_SHA_256");
  });

  test("RSA honours a SHA-384 signature algorithm override", async () => {
    const { signCalls } = rsaKms();

    const { certificate } = await createAndSignRoot(CertKeyAlgorithm.RSA_2048, {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-384"
    } as Algorithm);

    expect(signCalls[0].SigningAlgorithm).toBe("RSASSA_PKCS1_V1_5_SHA_384");
    expect(certificate.signatureAlgorithm).toMatchObject({ hash: { name: "SHA-384" } });
    expect(await certificate.verify({ signatureOnly: true })).toBe(true);
  });

  test("ECDSA certificates and CRLs signed through KMS verify against the KMS public key", async ({ skip }) => {
    if (!isOpensslAvailable) skip();
    const { signCalls } = ecdsaKms("P-384");

    const { signer, certificate } = await createAndSignRoot(CertKeyAlgorithm.ECDSA_P384);
    const crl = await signer.createCrl({ issuer: "CN=Root CA", thisUpdate: new Date(), entries: [] });

    const tbs = Buffer.from(AsnConvert.serialize(AsnConvert.parse(certificate.rawData, Certificate).tbsCertificate));
    expect(signCalls[0].SigningAlgorithm).toBe("ECDSA_SHA_384");
    expect(Buffer.from(signCalls[0].Message as Uint8Array)).toEqual(
      nodeCrypto.createHash("sha384").update(tbs).digest()
    );
    expect(certificate.signatureAlgorithm).toMatchObject({ name: "ECDSA", hash: { name: "SHA-384" } });
    expect(await certificate.verify({ publicKey: signer.caPublicKey, signatureOnly: true })).toBe(true);
    expect(await crl.verify({ publicKey: signer.caPublicKey })).toBe(true);
  });

  test("ML-DSA certificates signed through KMS with EXTERNAL_MU verify against the KMS public key", async ({
    skip
  }) => {
    if (!isOpensslAvailable) skip();
    await initializePqcSupport();
    try {
      const { signCalls } = await mlDsaKms("ML-DSA-65");

      const { certificate } = await createAndSignRoot(CertKeyAlgorithm.ML_DSA_65);

      expect(signCalls[0]).toMatchObject({ MessageType: "EXTERNAL_MU", SigningAlgorithm: "ML_DSA_SHAKE_256" });
      expect(opensslVerifySelfSigned(certificate)).toContain("OK");
    } finally {
      x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    }
  });

  test("reuses one throwaway key per algorithm instead of generating one per signature", async () => {
    rsaKms();
    const generateKey = vi.spyOn(crypto.nativeCrypto.subtle, "generateKey");
    const provider = awsKmsCaKeySourceFactory(buildDeps());
    const reference = await provider.createKey({
      projectId: "project",
      caName: "root-ca",
      keyAlgorithm: CertKeyAlgorithm.RSA_2048,
      input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
    });

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const signer = await provider.buildSigner({
        projectId: "project",
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        reference
      });
      // eslint-disable-next-line no-await-in-loop
      const certificate = await signer.createCertificate({
        subject: "CN=Root CA",
        issuer: "CN=Root CA",
        serialNumber: `0${i + 1}`,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 86_400_000),
        publicKey: signer.caPublicKey
      });
      // eslint-disable-next-line no-await-in-loop
      expect(await certificate.verify({ publicKey: signer.caPublicKey, signatureOnly: true })).toBe(true);
    }

    expect(generateKey).toHaveBeenCalledTimes(1);
  });

  test("ECDSA rejects a hash AWS KMS cannot use with the curve", async () => {
    ecdsaKms("P-256");

    await expect(
      createAndSignRoot(CertKeyAlgorithm.ECDSA_P256, { name: "ECDSA", hash: "SHA-384" } as Algorithm)
    ).rejects.toThrow(BadRequestError);
  });

  test("refuses to create a key without the AWS KMS signing entitlement", async () => {
    rsaKms();
    const provider = awsKmsCaKeySourceFactory(buildDeps({ pkiAwsKmsSigning: false }));

    await expect(
      provider.createKey({
        projectId: "project",
        caName: "root-ca",
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
      })
    ).rejects.toThrow(/plan restriction/);
  });

  test("turns an AWS access denial into a readable error naming the IAM permissions", async () => {
    vi.spyOn(KMSClient.prototype, "send").mockRejectedValue(
      Object.assign(new Error("User is not authorized"), { name: "AccessDeniedException" })
    );
    const provider = awsKmsCaKeySourceFactory(buildDeps());

    await expect(
      provider.createKey({
        projectId: "project",
        caName: "root-ca",
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
      })
    ).rejects.toThrow(/kms:CreateKey/);
  });

  test("releasing a key schedules its deletion with a 30-day window", async () => {
    const send = vi.spyOn(KMSClient.prototype, "send").mockResolvedValue({} as never);
    const provider = awsKmsCaKeySourceFactory(buildDeps());

    const release = await provider.prepareKeyRelease?.({
      reference: { appConnectionId: "conn", externalKeyId: KEY_ARN }
    });
    expect(send).not.toHaveBeenCalled();
    await release?.();

    const command = send.mock.calls[0][0] as unknown;
    expect(command).toBeInstanceOf(ScheduleKeyDeletionCommand);
    expect((command as ScheduleKeyDeletionCommand).input).toEqual({ KeyId: KEY_ARN, PendingWindowInDays: 30 });
  });

  test("names the new key with an alias built from the CA name", async () => {
    const { aliasCalls } = rsaKms();
    const provider = awsKmsCaKeySourceFactory(buildDeps());

    await provider.createKey({
      projectId: "project",
      caName: "root-ca",
      keyAlgorithm: CertKeyAlgorithm.RSA_2048,
      input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
    });

    expect(aliasCalls).toHaveLength(1);
    expect(aliasCalls[0].TargetKeyId).toBe(KEY_ARN);
    expect(aliasCalls[0].AliasName).toMatch(/^alias\/infisical-ca-root-ca-[a-zA-Z0-9]{5}$/);
  });

  test("still creates the key when the alias cannot be created", async () => {
    const accessDenied = Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    const { publicKeySpki } = rsaKms();
    vi.spyOn(KMSClient.prototype, "send").mockImplementation((async (command: unknown) => {
      if (command instanceof CreateKeyCommand) return { KeyMetadata: { Arn: KEY_ARN } };
      if (command instanceof GetPublicKeyCommand) return { PublicKey: publicKeySpki };
      if (command instanceof CreateAliasCommand) throw accessDenied;
      return {};
    }) as never);
    const provider = awsKmsCaKeySourceFactory(buildDeps());

    const created = await provider.createKey({
      projectId: "project",
      caName: "root-ca",
      keyAlgorithm: CertKeyAlgorithm.RSA_2048,
      input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
    });

    expect(created.externalKeyId).toBe(KEY_ARN);
  });

  test("schedules deletion of a newly created key whose public key cannot be read", async () => {
    const accessDenied = Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    const send = vi.spyOn(KMSClient.prototype, "send").mockImplementation((async (command: unknown) => {
      if (command instanceof CreateKeyCommand) return { KeyMetadata: { Arn: KEY_ARN } };
      if (command instanceof GetPublicKeyCommand) throw accessDenied;
      return {};
    }) as never);
    const provider = awsKmsCaKeySourceFactory(buildDeps());

    await expect(
      provider.createKey({
        projectId: "project",
        caName: "root-ca",
        keyAlgorithm: CertKeyAlgorithm.RSA_2048,
        input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
      })
    ).rejects.toThrow(BadRequestError);

    const deletion = send.mock.calls.map(([command]) => command as unknown).at(-1);
    expect(deletion).toBeInstanceOf(ScheduleKeyDeletionCommand);
    expect((deletion as ScheduleKeyDeletionCommand).input).toEqual({ KeyId: KEY_ARN, PendingWindowInDays: 30 });
  });

  test("CSR signature algorithms resolve to what the CA's key source can sign with", async () => {
    const findOne = vi.fn();
    const service = caKeySourceServiceFactory({
      ...buildDeps(),
      certificateAuthoritySecretDAL: { findOne } as never
    });
    const resolve = (keySource: CertKeySource, keyAlgorithm: CertKeyAlgorithm) => {
      findOne.mockResolvedValueOnce({ keySource });
      return service.resolveCsrSignatureAlgorithm({ caId: "ca", keyAlgorithm, csrSignatureAlgorithm: "ECDSA-SHA256" });
    };

    expect(await resolve(CertKeySource.AwsKms, CertKeyAlgorithm.ECDSA_P384)).toBe("ECDSA-SHA384");
    expect(await resolve(CertKeySource.AwsKms, CertKeyAlgorithm.ECDSA_P521)).toBe("ECDSA-SHA512");
    expect(await resolve(CertKeySource.AwsKms, CertKeyAlgorithm.RSA_2048)).toBe("ECDSA-SHA256");
    expect(await resolve(CertKeySource.Hsm, CertKeyAlgorithm.ECDSA_P384)).toBe("ECDSA-SHA256");
    expect(await resolve(CertKeySource.Infisical, CertKeyAlgorithm.ECDSA_P384)).toBe("ECDSA-SHA256");
  });

  test("the registry rejects algorithms a key source cannot hold", async () => {
    const service = caKeySourceServiceFactory(buildDeps());

    await expect(
      service.createKey({
        keySource: CertKeySource.Hsm,
        projectId: "project",
        caName: "root-ca",
        keyAlgorithm: CertKeyAlgorithm.ECDSA_P521,
        input: { hsmConnectorId: "connector" }
      })
    ).rejects.toThrow(/not supported for HSM-backed/);

    await expect(
      service.createKey({
        keySource: CertKeySource.AwsKms,
        projectId: "project",
        caName: "root-ca",
        keyAlgorithm: CertKeyAlgorithm.SLH_DSA_SHA2_128F,
        input: { appConnectionId: "conn", region: AWSRegion.US_EAST_1 }
      })
    ).rejects.toThrow(/not supported for AWS KMS-backed/);
  });
});
