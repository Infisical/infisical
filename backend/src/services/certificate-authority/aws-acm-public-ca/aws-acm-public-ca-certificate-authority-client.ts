import { ACMClient } from "@aws-sdk/client-acm";
import * as x509 from "@peculiar/x509";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnection } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { AWS_ACM_CERTIFICATE_VALIDITY_DAYS } from "./aws-acm-public-ca-certificate-authority-enums";

// ─────────────────────────────────────────────────────────────────────────────
// FAKE_ACM — START
// TODO(FAKE_ACM): strip this entire block and all `// FAKE_ACM` lines before
// committing. Search for the token FAKE_ACM to find every call site that needs
// cleanup. To opt into real AWS calls (and billing), set PKI_ACM_USE_REAL_AWS=true.
// ─────────────────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
export const FAKE_ACM_USE_REAL = process.env.PKI_ACM_USE_REAL_AWS === "true";

type FakeAcmPhase = "requested" | "issued" | "renewing" | "renewed";
const fakeAcmStateByArn = new Map<string, { phase: FakeAcmPhase; notAfter: Date }>();

// Cache fake fixtures per ARN so retries/exports of the same cert return the
// same body (matching real ACM semantics) while different ARNs get distinct
// certs with unique serial numbers (avoids DB unique-constraint collisions).
const fakeAcmFixturesByArn = new Map<string, { certificatePem: string; chainPem: string; unencryptedKeyPem: string }>();

const buildFakeAcmFixtures = async (arn: string) => {
  const cached = fakeAcmFixturesByArn.get(arn);
  if (cached) return cached;
  const keys = (await crypto.nativeCrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    name: "CN=fake.acm.test",
    notBefore: new Date(),
    notAfter: new Date(Date.now() + AWS_ACM_CERTIFICATE_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
    keys,
    signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
  });
  const skObj = crypto.nativeCrypto.KeyObject.from(keys.privateKey);
  const fixtures = {
    certificatePem: cert.toString("pem"),
    chainPem: cert.toString("pem"),
    unencryptedKeyPem: skObj.export({ format: "pem", type: "pkcs8" }) as string
  };
  fakeAcmFixturesByArn.set(arn, fixtures);
  return fixtures;
};

// Minimal fake ACMClient — intercepts .send() based on command class name.
// Returns canned responses that drive the real code's state machine (retry
// loop, renewal flow, export parsing, etc.) without hitting AWS.
const createFakeAcmClient = () => {
  logger.warn("[FAKE_ACM] Creating fake ACMClient — no AWS calls will be made");
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    send: async (command: any) => {
      const cmdName = command?.constructor?.name as string | undefined;
      const input = command?.input ?? {};

      if (cmdName === "ListCertificatesCommand") {
        logger.info("[FAKE_ACM] ListCertificates");
        return { CertificateSummaryList: [] };
      }

      if (cmdName === "RequestCertificateCommand") {
        const token = (input.IdempotencyToken as string) || `nt${Date.now()}`;
        const arn = `arn:aws:acm:us-east-1:000000000000:certificate/${token}`;
        if (!fakeAcmStateByArn.has(arn)) {
          fakeAcmStateByArn.set(arn, {
            phase: "requested",
            notAfter: new Date(Date.now() + AWS_ACM_CERTIFICATE_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
          });
        }
        logger.info(`[FAKE_ACM] RequestCertificate token=${token} → ${arn}`);
        return { CertificateArn: arn };
      }

      if (cmdName === "DescribeCertificateCommand") {
        const arn = input.CertificateArn as string;
        const state = fakeAcmStateByArn.get(arn) ?? {
          phase: "issued" as FakeAcmPhase,
          notAfter: new Date(Date.now() + AWS_ACM_CERTIFICATE_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail: any = {
          CertificateArn: arn,
          DomainName: "fake.acm.test",
          NotAfter: state.notAfter,
          DomainValidationOptions: [
            {
              DomainName: "fake.acm.test",
              ValidationStatus: state.phase === "requested" ? "PENDING_VALIDATION" : "SUCCESS",
              ResourceRecord: {
                Name: "_fake.fake.acm.test.",
                Type: "CNAME",
                Value: "_fake.acm-validations.aws."
              }
            }
          ]
        };

        if (state.phase === "requested") {
          detail.Status = "PENDING_VALIDATION";
          state.phase = "issued";
        } else if (state.phase === "renewing") {
          detail.Status = "ISSUED";
          detail.RenewalSummary = {
            RenewalStatus: "PENDING_VALIDATION",
            DomainValidationOptions: detail.DomainValidationOptions,
            UpdatedAt: new Date()
          };
          state.phase = "renewed";
        } else if (state.phase === "renewed") {
          state.notAfter = new Date(Date.now() + AWS_ACM_CERTIFICATE_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
          detail.Status = "ISSUED";
          detail.NotAfter = state.notAfter;
          detail.RenewalSummary = {
            RenewalStatus: "SUCCESS",
            DomainValidationOptions: detail.DomainValidationOptions,
            UpdatedAt: new Date()
          };
        } else {
          detail.Status = "ISSUED";
        }

        fakeAcmStateByArn.set(arn, state);
        logger.info(
          `[FAKE_ACM] DescribeCertificate ${arn} phase=${state.phase} status=${detail.Status} renewal=${detail.RenewalSummary?.RenewalStatus ?? "n/a"}`
        );
        return { Certificate: detail };
      }

      if (cmdName === "ExportCertificateCommand") {
        const fixtures = await buildFakeAcmFixtures(input.CertificateArn as string);
        const passphrase = Buffer.from(input.Passphrase as Uint8Array).toString("utf8");
        const keyObj = crypto.nativeCrypto.createPrivateKey(fixtures.unencryptedKeyPem);
        const encryptedKey = keyObj.export({
          format: "pem",
          type: "pkcs8",
          cipher: "aes-256-cbc",
          passphrase
        }) as string;
        logger.info(`[FAKE_ACM] ExportCertificate ${input.CertificateArn as string}`);
        return {
          Certificate: fixtures.certificatePem,
          CertificateChain: fixtures.chainPem,
          PrivateKey: encryptedKey
        };
      }

      if (cmdName === "RenewCertificateCommand") {
        const arn = input.CertificateArn as string;
        const state = fakeAcmStateByArn.get(arn);
        if (state) {
          state.phase = "renewing";
          fakeAcmStateByArn.set(arn, state);
        }
        logger.info(`[FAKE_ACM] RenewCertificate ${arn}`);
        return {};
      }

      if (cmdName === "RevokeCertificateCommand") {
        logger.info(`[FAKE_ACM] RevokeCertificate ${input.CertificateArn as string}`);
        return {};
      }

      throw new Error(`[FAKE_ACM] Unhandled command: ${cmdName ?? "unknown"}`);
    }
  };
};
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
// ─────────────────────────────────────────────────────────────────────────────
// FAKE_ACM — END
// ─────────────────────────────────────────────────────────────────────────────

export const createAcmClient = async ({
  appConnectionId,
  region,
  appConnectionDAL,
  kmsService
}: {
  appConnectionId: string;
  region: AWSRegion;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
}) => {
  // FAKE_ACM: short-circuit to the fake client unless PKI_ACM_USE_REAL_AWS=true.
  if (!FAKE_ACM_USE_REAL) {
    logger.warn(
      `[FAKE_ACM] Bypassing real ACM client [appConnectionId=${appConnectionId}] [region=${region}] — set PKI_ACM_USE_REAL_AWS=true to hit AWS.`
    );
    return createFakeAcmClient() as unknown as ACMClient;
  }

  const appConnection = await appConnectionDAL.findById(appConnectionId);
  if (!appConnection) {
    throw new NotFoundError({ message: `App connection with ID '${appConnectionId}' not found` });
  }

  const decryptedConnection = (await decryptAppConnection(appConnection, kmsService)) as TAwsConnection;
  const awsConfig = await getAwsConnectionConfig(decryptedConnection, region);

  return new ACMClient({
    sha256: CustomAWSHasher,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    credentials: awsConfig.credentials,
    region: awsConfig.region
  });
};

export const resolveDnsAwsConnection = async ({
  dnsAppConnectionId,
  appConnectionDAL,
  kmsService
}: {
  dnsAppConnectionId: string;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
}) => {
  const dnsAppConnection = await appConnectionDAL.findById(dnsAppConnectionId);
  if (!dnsAppConnection) {
    throw new NotFoundError({ message: `DNS app connection with ID '${dnsAppConnectionId}' not found` });
  }
  return (await decryptAppConnection(dnsAppConnection, kmsService)) as TAwsConnection;
};
