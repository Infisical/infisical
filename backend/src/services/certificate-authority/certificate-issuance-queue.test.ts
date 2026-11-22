import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { CaType } from "./certificate-authority-enums";
import { certificateIssuanceQueueFactory, TIssueCertificateFromProfileJobData } from "./certificate-issuance-queue";

const digicertFns = {
  orderCertificate: vi.fn(),
  reissueCertificate: vi.fn(),
  cancelReissue: vi.fn(),
  fetchAndAttachIssuedCertificate: vi.fn()
};

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("./digicert/digicert-certificate-authority-fns", () => ({
  DigiCertCertificateAuthorityFns: () => digicertFns
}));

const CA_ID = "ca-1";
const ORDER_ID = 7001;
const ORIGINAL_CERTIFICATE_ID = "00000000-0000-4000-8000-000000000001";
const CERTIFICATE_REQUEST_ID = "00000000-0000-4000-8000-000000000002";

const stubDeps = () => {
  const stubs = new Map<string, unknown>();
  return new Proxy({} as Record<string, unknown>, {
    get: (_target, property: string) => {
      if (!stubs.has(property)) stubs.set(property, vi.fn());
      return stubs.get(property);
    }
  });
};

const buildQueue = () => {
  let runJob: ((job: { data: TIssueCertificateFromProfileJobData }) => Promise<void>) | undefined;
  const queueService = {
    start: vi.fn((_queue: string, handler: typeof runJob) => {
      runJob = handler;
    }),
    queue: vi.fn()
  };
  const certificateAuthorityDAL = {
    findByIdWithAssociatedCa: vi.fn().mockResolvedValue({
      id: CA_ID,
      projectId: "project-1",
      externalCa: { id: "external-ca-1", type: CaType.DIGICERT }
    })
  };
  const certificateDAL = {
    primaryNode: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      id: ORIGINAL_CERTIFICATE_ID,
      externalMetadata: { type: CaType.DIGICERT, orderId: ORDER_ID, certificateId: 50001 }
    })
  };
  const certificateRequestDAL = {
    findById: vi.fn().mockResolvedValue({ id: CERTIFICATE_REQUEST_ID, status: CertificateRequestStatus.PENDING }),
    setPendingMessage: vi.fn(),
    transitionToPendingValidation: vi.fn().mockResolvedValue(true)
  };

  certificateIssuanceQueueFactory({
    ...stubDeps(),
    queueService,
    certificateAuthorityDAL,
    certificateDAL,
    certificateRequestDAL
  } as unknown as Parameters<typeof certificateIssuanceQueueFactory>[0]);

  const run = (data: Partial<TIssueCertificateFromProfileJobData>) =>
    runJob!({
      data: {
        certificateId: "renewal-1",
        caId: CA_ID,
        caType: CaType.DIGICERT,
        commonName: "example.com",
        altNames: [{ type: "dns_name", value: "example.com" }],
        ttl: "90d",
        signatureAlgorithm: "RSA-SHA256",
        keyAlgorithm: "RSA_2048",
        isRenewal: true,
        originalCertificateId: ORIGINAL_CERTIFICATE_ID,
        certificateRequestId: CERTIFICATE_REQUEST_ID,
        ...data
      }
    });
  return Object.assign(run, { certificateRequestDAL });
};

const digicertResult = {
  metadata: {
    digicert: {
      orderId: ORDER_ID,
      productNameId: "ssl_basic",
      organizationId: 777,
      orderPlacedAt: new Date().toISOString()
    }
  },
  privateKey: "",
  orderId: ORDER_ID
};

describe("certificate issuance queue, DigiCert renewals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    digicertFns.orderCertificate.mockResolvedValue(digicertResult);
    digicertFns.reissueCertificate.mockResolvedValue(digicertResult);
  });

  test("reissues on the original certificate's DigiCert order when reissue is requested", async () => {
    const runJob = buildQueue();

    await runJob({ externalConfiguration: { reissue: true } });

    expect(digicertFns.reissueCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ caId: CA_ID, orderId: ORDER_ID, originalCertificateId: ORIGINAL_CERTIFICATE_ID })
    );
    expect(digicertFns.orderCertificate).not.toHaveBeenCalled();
  });

  test("places a new order linked to the original order for a plain renewal", async () => {
    const runJob = buildQueue();

    await runJob({});

    expect(digicertFns.orderCertificate).toHaveBeenCalledWith(
      expect.objectContaining({ caId: CA_ID, renewalOfOrderId: ORDER_ID })
    );
    expect(digicertFns.reissueCertificate).not.toHaveBeenCalled();
  });

  test("hands a reissue to the poller before DigiCert is called", async () => {
    const runJob = buildQueue();
    const reissueMetadata = { ...digicertResult.metadata.digicert, previousCertificateId: 50001 };
    digicertFns.reissueCertificate.mockImplementation(
      async ({ onBeforeSubmit }: { onBeforeSubmit: (prepared: object) => Promise<void> }) => {
        await onBeforeSubmit({ metadata: { digicert: reissueMetadata }, privateKey: "" });
        expect(runJob.certificateRequestDAL.transitionToPendingValidation).toHaveBeenCalledWith(
          CERTIFICATE_REQUEST_ID,
          expect.objectContaining({ metadata: expect.stringContaining('"previousCertificateId":50001') as string })
        );
        return digicertResult;
      }
    );

    await runJob({ externalConfiguration: { reissue: true }, csr: "csr" });

    expect(runJob.certificateRequestDAL.transitionToPendingValidation).toHaveBeenCalledTimes(1);
  });

  test("leaves a handed-off reissue pending when DigiCert's answer is lost", async () => {
    const runJob = buildQueue();
    digicertFns.reissueCertificate.mockImplementation(
      async ({ onBeforeSubmit }: { onBeforeSubmit: (prepared: object) => Promise<void> }) => {
        await onBeforeSubmit({ metadata: digicertResult.metadata, privateKey: "" });
        throw new InternalServerError({ message: "DigiCert reissue for order 7001 failed (no response)" });
      }
    );

    await expect(runJob({ externalConfiguration: { reissue: true }, csr: "csr" })).resolves.toBeUndefined();

    expect(runJob.certificateRequestDAL.setPendingMessage).toHaveBeenCalledWith(
      CERTIFICATE_REQUEST_ID,
      expect.stringContaining("didn't confirm the reissue")
    );
  });

  test("fails a reissue that DigiCert rejected", async () => {
    const runJob = buildQueue();
    digicertFns.reissueCertificate.mockImplementation(
      async ({ onBeforeSubmit }: { onBeforeSubmit: (prepared: object) => Promise<void> }) => {
        await onBeforeSubmit({ metadata: digicertResult.metadata, privateKey: "" });
        throw new BadRequestError({ message: "DigiCert reissue for order 7001 failed: invalid_order_status" });
      }
    );

    await expect(runJob({ externalConfiguration: { reissue: true }, csr: "csr" })).rejects.toThrow(
      "invalid_order_status"
    );
  });
});
