import { BadRequestError, DatabaseError, InternalServerError } from "@app/lib/errors";

import { CaOperationFailureStage } from "../certificate-common/certificate-constants";
import { CertificateRequestStatus } from "../certificate-request/certificate-request-types";
import { CaStatus, CaType } from "./certificate-authority-enums";
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

const orderFns = {
  [CaType.AZURE_AD_CS]: { orderCertificate: vi.fn() },
  [CaType.ADCS]: { orderCertificate: vi.fn() },
  [CaType.AWS_ACM_PUBLIC_CA]: { orderCertificate: vi.fn() },
  [CaType.AWS_PCA]: { orderCertificate: vi.fn() },
  [CaType.VENAFI_TPP]: { orderCertificate: vi.fn() }
};
vi.mock("./azure-ad-cs/azure-ad-cs-certificate-authority-fns", () => ({
  AzureAdCsCertificateAuthorityFns: () => orderFns[CaType.AZURE_AD_CS]
}));
vi.mock("./adcs/adcs-certificate-authority-fns", () => ({ ADCSCertificateAuthorityFns: () => orderFns[CaType.ADCS] }));
vi.mock("./aws-acm-public-ca/aws-acm-public-ca-certificate-authority-fns", () => ({
  AwsAcmPublicCaCertificateAuthorityFns: () => orderFns[CaType.AWS_ACM_PUBLIC_CA]
}));
vi.mock("./aws-pca/aws-pca-certificate-authority-fns", () => ({
  AwsPcaCertificateAuthorityFns: () => orderFns[CaType.AWS_PCA]
}));
vi.mock("./venafi-tpp/venafi-tpp-certificate-authority-fns", () => ({
  VenafiTppCertificateAuthorityFns: () => orderFns[CaType.VENAFI_TPP]
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
      name: "digicert-ca",
      status: CaStatus.ACTIVE,
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
  const certificateRequestService = {
    updateCertificateRequestStatus: vi.fn().mockResolvedValue(undefined),
    attachCertificateToRequest: vi.fn().mockResolvedValue(undefined)
  };

  certificateIssuanceQueueFactory({
    ...stubDeps(),
    queueService,
    certificateAuthorityDAL,
    certificateDAL,
    certificateRequestDAL,
    certificateRequestService
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
  return Object.assign(run, {
    certificateAuthorityDAL,
    certificateDAL,
    certificateRequestDAL,
    certificateRequestService
  });
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

describe("certificate issuance queue, where a failed renewal stopped", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    digicertFns.orderCertificate.mockResolvedValue(digicertResult);
  });

  test("reports a renewal of a deleted certificate as Infisical's check, not the CA's", async () => {
    const runJob = buildQueue();
    runJob.certificateDAL.findById.mockResolvedValue({ id: ORIGINAL_CERTIFICATE_ID, deletedAt: new Date() });

    await expect(runJob({})).rejects.toThrow();

    expect(digicertFns.orderCertificate, "the CA is never called").not.toHaveBeenCalled();
    expect(runJob.certificateRequestService.updateCertificateRequestStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CertificateRequestStatus.FAILED,
        failureStage: CaOperationFailureStage.Infisical
      })
    );
  });

  test("reports a CA disabled in Infisical as Infisical's check, without calling the CA", async () => {
    const runJob = buildQueue();
    runJob.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
      id: CA_ID,
      name: "digicert-ca",
      status: CaStatus.DISABLED,
      projectId: "project-1",
      externalCa: { id: "external-ca-1", type: CaType.DIGICERT }
    });

    await expect(runJob({})).rejects.toThrow("Certificate Authority 'digicert-ca' is disabled");

    expect(digicertFns.orderCertificate, "the CA is never called").not.toHaveBeenCalled();
    expect(runJob.certificateRequestService.updateCertificateRequestStatus).toHaveBeenCalledWith(
      expect.objectContaining({ failureStage: CaOperationFailureStage.Infisical })
    );
  });

  test("reports a CA error once the CA has been called as the CA's", async () => {
    const runJob = buildQueue();
    digicertFns.orderCertificate.mockRejectedValue(new BadRequestError({ message: "DigiCert rejected the order" }));

    await expect(runJob({})).rejects.toThrow("DigiCert rejected the order");

    expect(runJob.certificateRequestService.updateCertificateRequestStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: CertificateRequestStatus.FAILED, failureStage: CaOperationFailureStage.Ca })
    );
  });
});

describe("certificate issuance queue, a certificate the CA issued but Infisical couldn't attach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each(Object.keys(orderFns) as (keyof typeof orderFns)[])(
    "reports the attach step, not the CA, for %s",
    async (caType) => {
      const runJob = buildQueue();
      runJob.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
        id: CA_ID,
        name: "external-ca",
        status: CaStatus.ACTIVE,
        projectId: "project-1",
        externalCa: { id: "external-ca-1", type: caType }
      });
      orderFns[caType].orderCertificate.mockResolvedValue({ certificateId: "issued-1", privateKey: "" });
      runJob.certificateRequestService.attachCertificateToRequest.mockRejectedValue(
        new DatabaseError({ name: "Attach certificate to request", error: new Error("connection reset") })
      );

      await runJob({ caType, isRenewal: false, originalCertificateId: undefined }).catch(() => undefined);

      expect(orderFns[caType].orderCertificate, "the CA issued the certificate").toHaveBeenCalled();
      expect(runJob.certificateRequestService.updateCertificateRequestStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          status: CertificateRequestStatus.FAILED,
          failureStage: CaOperationFailureStage.AttachingIssuedCertificate
        })
      );
    }
  );
});

describe("certificate issuance queue, a request approved just before the job runs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the request's status from the primary, where approval just set it pending", async () => {
    const runJob = buildQueue();
    const primary = { isPrimary: true };
    runJob.certificateDAL.primaryNode.mockReturnValue(primary);
    digicertFns.orderCertificate.mockResolvedValue(digicertResult);

    await runJob({});

    expect(runJob.certificateRequestDAL.findById).toHaveBeenCalledWith(CERTIFICATE_REQUEST_ID, primary);
    expect(runJob.certificateRequestDAL.findById).not.toHaveBeenCalledWith(CERTIFICATE_REQUEST_ID);
    expect(digicertFns.orderCertificate, "the job still reaches the CA").toHaveBeenCalled();
  });
});
