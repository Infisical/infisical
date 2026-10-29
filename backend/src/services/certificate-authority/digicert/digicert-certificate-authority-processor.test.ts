import { TCertificateRequests } from "@app/db/schemas";

import { CertificateRequestStatus } from "../../certificate-common/certificate-constants";
import { TDigiCertApiClient } from "./digicert-api-client";
import {
  processDigiCertPendingValidationRequest,
  TProcessDigiCertRequestDeps
} from "./digicert-certificate-authority-processor";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

const CA_ID = "ca-1";
const ORDER_ID = 7001;
const PREVIOUS_CERTIFICATE_ID = 50001;
const REISSUED_CERTIFICATE_ID = 50002;

const buildRequest = (orderPlacedAt = new Date().toISOString()) =>
  ({
    id: "request-1",
    caId: CA_ID,
    projectId: "project-1",
    profileId: "profile-1",
    applicationId: null,
    commonName: "example.com",
    altNames: "example.com,www.example.com",
    keyUsages: [],
    extendedKeyUsages: [],
    keyAlgorithm: "RSA_2048",
    signatureAlgorithm: "RSA-SHA256",
    encryptedPrivateKey: null,
    metadata: JSON.stringify({
      digicert: {
        orderId: ORDER_ID,
        productNameId: "ssl_basic",
        organizationId: 777,
        orderPlacedAt,
        previousCertificateId: PREVIOUS_CERTIFICATE_ID,
        isRenewal: true,
        originalCertificateId: "00000000-0000-4000-8000-000000000001"
      }
    })
  }) as unknown as TCertificateRequests;

const buildDeps = () => {
  const fetchAndAttachIssuedCertificate = vi.fn().mockResolvedValue({ certificateId: "new-cert", certificatePem: "" });
  const deps = {
    certificateAuthorityDAL: { findByIdWithAssociatedCa: vi.fn() },
    appConnectionDAL: { findById: vi.fn() },
    kmsService: { createCipherPairWithDataKey: vi.fn() },
    certificateRequestDAL: { updateById: vi.fn(), setPendingMessage: vi.fn() },
    certificateRequestService: {
      updateCertificateRequestStatus: vi.fn(),
      attachCertificateToRequest: vi.fn()
    },
    resourceMetadataDAL: { find: vi.fn().mockResolvedValue([]), insertMany: vi.fn() },
    digicertFns: { fetchAndAttachIssuedCertificate },
    projectDAL: { findById: vi.fn().mockResolvedValue({ orgId: "org-1" }) },
    telemetryService: { sendPostHogEvents: vi.fn() },
    certificateAlertEventEmitter: { notify: vi.fn() }
  } as unknown as TProcessDigiCertRequestDeps;
  return { deps, fetchAndAttachIssuedCertificate };
};

const buildClientCache = (client: Partial<TDigiCertApiClient>) => new Map([[CA_ID, client as TDigiCertApiClient]]);

describe("processDigiCertPendingValidationRequest reissue", () => {
  test("keeps waiting while the order still reports the certificate being replaced", async () => {
    const { deps, fetchAndAttachIssuedCertificate } = buildDeps();
    const checkValidation = vi.fn().mockResolvedValue({
      order_status: "issued",
      certificate_id: PREVIOUS_CERTIFICATE_ID
    });
    const client = {
      getOrder: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        status: "reissue_pending",
        certificate: { id: PREVIOUS_CERTIFICATE_ID }
      }),
      checkValidation
    };

    const result = await processDigiCertPendingValidationRequest(deps, buildRequest(), buildClientCache(client));

    expect(checkValidation).toHaveBeenCalledWith(ORDER_ID);
    expect(fetchAndAttachIssuedCertificate).not.toHaveBeenCalled();
    expect(result.status).toBe(CertificateRequestStatus.PENDING_VALIDATION);
  });

  test("attaches the reissued certificate once DigiCert issues it", async () => {
    const { deps, fetchAndAttachIssuedCertificate } = buildDeps();
    const client = {
      getOrder: vi.fn().mockResolvedValue({
        id: ORDER_ID,
        status: "issued",
        certificate: { id: REISSUED_CERTIFICATE_ID }
      }),
      checkValidation: vi.fn()
    };

    const result = await processDigiCertPendingValidationRequest(deps, buildRequest(), buildClientCache(client));

    expect(fetchAndAttachIssuedCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ digicertCertificateId: REISSUED_CERTIFICATE_ID, digicertOrderId: ORDER_ID })
    );
    expect(result.status).toBe(CertificateRequestStatus.ISSUED);
  });

  test("fails a reissue that DigiCert hasn't finished within 24 hours with a next step", async () => {
    const { deps } = buildDeps();
    const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    const result = await processDigiCertPendingValidationRequest(deps, buildRequest(dayAgo), buildClientCache({}));

    expect(result.status).toBe(CertificateRequestStatus.FAILED);
    expect(deps.certificateRequestService.updateCertificateRequestStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: expect.stringContaining(`reissue on order ${ORDER_ID} within 24 hours`) as string
      })
    );
  });
});
