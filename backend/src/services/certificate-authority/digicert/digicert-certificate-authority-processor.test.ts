import { TCertificateRequests } from "@app/db/schemas";

import { CertificateRequestStatus } from "../../certificate-common/certificate-constants";
import { PkiAlertEventType } from "../../pki-alert-v2/pki-alert-v2-types";
import { TDigiCertApiClient } from "./digicert-api-client";
import { DigiCertOrderStatus } from "./digicert-certificate-authority-enums";
import {
  processDigiCertPendingValidationRequest,
  TProcessDigiCertRequestDeps
} from "./digicert-certificate-authority-processor";

vi.mock("@app/lib/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
  },
  initLogger: () => {}
}));

const ISSUED_CERTIFICATE_ID = "11111111-1111-4111-8111-111111111111";

const buildRequest = (overrides: Partial<TCertificateRequests> = {}, isRenewal = false): TCertificateRequests =>
  ({
    id: "request-1",
    caId: "ca-1",
    projectId: "project-1",
    profileId: "profile-1",
    applicationId: null,
    commonName: "example.com",
    altNames: null,
    keyUsages: [],
    extendedKeyUsages: [],
    keyAlgorithm: "RSA_2048",
    signatureAlgorithm: "RSA-SHA256",
    encryptedPrivateKey: null,
    metadata: JSON.stringify({
      digicert: {
        orderId: 42,
        productNameId: "ssl_basic",
        organizationId: 7,
        orderPlacedAt: new Date().toISOString(),
        isRenewal
      }
    }),
    ...overrides
  }) as TCertificateRequests;

const buildDeps = (opts?: { queueError?: Error; withQueue?: boolean }) => {
  const queuedEvents: unknown[] = [];
  const attached: unknown[] = [];

  const deps: TProcessDigiCertRequestDeps = {
    certificateAuthorityDAL: { findByIdWithAssociatedCa: async () => ({}) } as never,
    appConnectionDAL: { findById: async () => null } as never,
    kmsService: {} as never,
    certificateRequestDAL: { updateById: async () => ({}), setPendingMessage: async () => ({}) } as never,
    certificateRequestService: {
      updateCertificateRequestStatus: async () => ({}),
      attachCertificateToRequest: async (args: unknown) => {
        attached.push(args);
      }
    },
    resourceMetadataDAL: { find: async () => [], insertMany: async () => [] } as never,
    digicertFns: {
      fetchAndAttachIssuedCertificate: async () => ({ certificateId: ISSUED_CERTIFICATE_ID })
    } as never,
    projectDAL: { findById: async () => ({ orgId: "org-1" }) } as never,
    telemetryService: { sendPostHogEvents: async () => {} } as never,
    pkiAlertV2Queue:
      opts?.withQueue === false
        ? undefined
        : {
            queueCertificateEvent: async (payload: unknown) => {
              if (opts?.queueError) throw opts.queueError;
              queuedEvents.push(payload);
            }
          }
  };

  return { deps, queuedEvents, attached };
};

const issuedClient = {
  getOrder: async () => ({ status: DigiCertOrderStatus.Issued, certificate: { id: 9001 } })
} as unknown as TDigiCertApiClient;

const pendingClient = {
  getOrder: async () => ({ status: DigiCertOrderStatus.Pending }),
  checkValidation: async () => ({ order_status: DigiCertOrderStatus.Pending, dcv_status: "pending" })
} as unknown as TDigiCertApiClient;

const clientCacheFor = (client: TDigiCertApiClient) => new Map([["ca-1", client]]);

describe("processDigiCertPendingValidationRequest", () => {
  it("queues an issuance alert event with the attached certificate id once the order is issued", async () => {
    const { deps, queuedEvents, attached } = buildDeps();

    const result = await processDigiCertPendingValidationRequest(deps, buildRequest(), clientCacheFor(issuedClient));

    expect(result.status).toBe(CertificateRequestStatus.ISSUED);
    expect(attached).toEqual([{ certificateRequestId: "request-1", certificateId: ISSUED_CERTIFICATE_ID }]);
    expect(queuedEvents).toEqual([
      {
        certificateId: ISSUED_CERTIFICATE_ID,
        projectId: "project-1",
        eventType: PkiAlertEventType.ISSUANCE,
        applicationId: null
      }
    ]);
  });

  it("queues a renewal alert event scoped to the request application for renewals", async () => {
    const { deps, queuedEvents } = buildDeps();

    await processDigiCertPendingValidationRequest(
      deps,
      buildRequest({ applicationId: "app-1" }, true),
      clientCacheFor(issuedClient)
    );

    expect(queuedEvents).toEqual([
      {
        certificateId: ISSUED_CERTIFICATE_ID,
        projectId: "project-1",
        eventType: PkiAlertEventType.RENEWAL,
        applicationId: "app-1"
      }
    ]);
  });

  it("still finalises the request when queueing the alert event fails", async () => {
    const { deps, attached } = buildDeps({ queueError: new Error("redis down") });

    const result = await processDigiCertPendingValidationRequest(deps, buildRequest(), clientCacheFor(issuedClient));

    expect(result.status).toBe(CertificateRequestStatus.ISSUED);
    expect(attached).toHaveLength(1);
  });

  it("finalises without an alert queue configured", async () => {
    const { deps } = buildDeps({ withQueue: false });

    const result = await processDigiCertPendingValidationRequest(deps, buildRequest(), clientCacheFor(issuedClient));

    expect(result.status).toBe(CertificateRequestStatus.ISSUED);
  });

  it("does not queue an alert event while the order is still pending", async () => {
    const { deps, queuedEvents } = buildDeps();

    const result = await processDigiCertPendingValidationRequest(deps, buildRequest(), clientCacheFor(pendingClient));

    expect(result.status).toBe(CertificateRequestStatus.PENDING_VALIDATION);
    expect(queuedEvents).toEqual([]);
  });
});
