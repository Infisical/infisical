import { beforeEach, describe, expect, it, vi } from "vitest";

import { QueueName } from "@app/queue";

import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { PkiAlertEventType } from "../pki-alert-v2/pki-alert-v2-types";
import { CaType } from "./certificate-authority-enums";
import { certificateIssuanceQueueFactory, TIssueCertificateFromProfileJobData } from "./certificate-issuance-queue";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const { orderCertificate, noopFns } = vi.hoisted(() => ({
  orderCertificate: vi.fn(),
  noopFns: () => ({})
}));

vi.mock("./aws-pca/aws-pca-certificate-authority-fns", () => ({
  AwsPcaCertificateAuthorityFns: () => ({ orderCertificate })
}));
vi.mock("./acme/acme-certificate-authority-fns", () => ({ AcmeCertificateAuthorityFns: noopFns }));
vi.mock("./adcs/adcs-certificate-authority-fns", () => ({ ADCSCertificateAuthorityFns: noopFns }));
vi.mock("./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-fns", () => ({
  AwsAcmPublicCaCertificateAuthorityFns: noopFns
}));
vi.mock("./azure-ad-cs/azure-ad-cs-certificate-authority-fns", () => ({ AzureAdCsCertificateAuthorityFns: noopFns }));
vi.mock("./digicert/digicert-certificate-authority-fns", () => ({ DigiCertCertificateAuthorityFns: noopFns }));
vi.mock("./godaddy/godaddy-certificate-authority-fns", () => ({ GoDaddyCertificateAuthorityFns: noopFns }));
vi.mock("./venafi-tpp/venafi-tpp-certificate-authority-fns", () => ({ VenafiTppCertificateAuthorityFns: noopFns }));

const ORDER_ID = "order-id-not-a-certificate";
const ISSUED_CERTIFICATE_ID = "issued-certificate-id";
const REQUEST_ID = "request-1";
const PROJECT_ID = "project-1";

type TJobHandler = (job: {
  data: TIssueCertificateFromProfileJobData;
  attemptsMade?: number;
  opts?: unknown;
}) => Promise<void>;

const buildQueue = (opts?: { requestCertificateIdOnRead?: string | null; certificateLookupError?: Error }) => {
  let handler: TJobHandler | undefined;
  const queuedEvents: unknown[] = [];
  const attached: unknown[] = [];
  const updatedStatuses: unknown[] = [];

  certificateIssuanceQueueFactory({
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: async () => ({
        id: "ca-1",
        projectId: PROJECT_ID,
        externalCa: { type: CaType.AWS_PCA }
      })
    } as never,
    appConnectionDAL: {} as never,
    appConnectionService: {} as never,
    externalCertificateAuthorityDAL: {} as never,
    certificateDAL: {
      findById: async () => {
        if (opts?.certificateLookupError) throw opts.certificateLookupError;
        return null;
      },
      updateById: async () => ({})
    } as never,
    projectDAL: { findById: async () => ({ orgId: "org-1" }) } as never,
    kmsService: {} as never,
    certificateBodyDAL: {} as never,
    certificateSecretDAL: {} as never,
    queueService: {
      start: (_queueName: QueueName, fn: TJobHandler) => {
        handler = fn;
      },
      queue: async () => {}
    } as never,
    pkiSubscriberDAL: {} as never,
    pkiSyncDAL: {} as never,
    pkiSyncQueue: {} as never,
    certificateSyncDAL: {} as never,
    certificateRequestService: {
      attachCertificateToRequest: async (args: unknown) => {
        attached.push(args);
      },
      updateCertificateRequestStatus: async (args: unknown) => {
        updatedStatuses.push(args);
      }
    } as never,
    certificateRequestDAL: {
      findById: async () => ({
        id: REQUEST_ID,
        status: CertificateRequestStatus.PENDING,
        certificateId:
          opts?.requestCertificateIdOnRead === undefined ? ISSUED_CERTIFICATE_ID : opts.requestCertificateIdOnRead
      }),
      updateById: async () => ({}),
      setPendingMessage: async () => ({}),
      transitionToPendingValidation: async () => ({})
    } as never,
    resourceMetadataDAL: { find: async () => [], insertMany: async () => [] } as never,
    pkiAlertV2Queue: {
      queueCertificateEvent: async (payload: unknown) => {
        queuedEvents.push(payload);
      }
    },
    gatewayV2Service: {} as never,
    gatewayPoolService: {} as never,
    keyStore: {} as never,
    telemetryService: { sendPostHogEvents: async () => {} } as never
  });

  if (!handler) throw new Error("queue handler was not registered");
  return { handler, queuedEvents, attached, updatedStatuses };
};

const buildJob = (overrides: Partial<TIssueCertificateFromProfileJobData> = {}) => ({
  data: {
    certificateId: ORDER_ID,
    caId: "ca-1",
    caType: CaType.AWS_PCA,
    commonName: "example.com",
    ttl: "30d",
    signatureAlgorithm: "RSA-SHA256",
    keyAlgorithm: "RSA_2048",
    certificateRequestId: REQUEST_ID,
    ...overrides
  }
});

describe("certificateIssuanceQueueFactory alert events", () => {
  beforeEach(() => {
    orderCertificate.mockReset();
    orderCertificate.mockResolvedValue({ certificateId: ISSUED_CERTIFICATE_ID });
  });

  it("queues the issuance event with the attached certificate id, not the order id", async () => {
    const { handler, queuedEvents, attached } = buildQueue();

    await handler(buildJob());

    expect(attached).toEqual([{ certificateRequestId: REQUEST_ID, certificateId: ISSUED_CERTIFICATE_ID }]);
    expect(queuedEvents).toEqual([
      {
        certificateId: ISSUED_CERTIFICATE_ID,
        projectId: PROJECT_ID,
        eventType: PkiAlertEventType.ISSUANCE,
        applicationId: null
      }
    ]);
  });

  it("queues the event even when a lagging replica read of the request has no certificate yet", async () => {
    const { handler, queuedEvents } = buildQueue({ requestCertificateIdOnRead: null });

    await handler(buildJob());

    expect(queuedEvents).toHaveLength(1);
    expect(queuedEvents[0]).toMatchObject({ certificateId: ISSUED_CERTIFICATE_ID });
  });

  it("queues a renewal event for renewal jobs", async () => {
    const { handler, queuedEvents } = buildQueue();

    await handler(buildJob({ isRenewal: true, originalCertificateId: "original-cert", applicationId: "app-1" }));

    expect(queuedEvents).toEqual([
      {
        certificateId: ISSUED_CERTIFICATE_ID,
        projectId: PROJECT_ID,
        eventType: PkiAlertEventType.RENEWAL,
        applicationId: "app-1"
      }
    ]);
  });

  it("still queues the event when resolving the renewal application scope fails", async () => {
    const { handler, queuedEvents } = buildQueue({ certificateLookupError: new Error("connection reset") });

    await handler(
      buildJob({
        certificateId: ISSUED_CERTIFICATE_ID,
        certificateRequestId: undefined,
        isRenewal: true,
        originalCertificateId: "original-cert"
      })
    );

    expect(queuedEvents).toEqual([
      {
        certificateId: ISSUED_CERTIFICATE_ID,
        projectId: PROJECT_ID,
        eventType: PkiAlertEventType.RENEWAL,
        applicationId: null
      }
    ]);
  });

  it("does not queue an event when the CA returned no certificate", async () => {
    orderCertificate.mockResolvedValue(undefined);
    const { handler, queuedEvents, attached } = buildQueue({ requestCertificateIdOnRead: null });

    await handler(buildJob());

    expect(attached).toEqual([]);
    expect(queuedEvents).toEqual([]);
  });
});
