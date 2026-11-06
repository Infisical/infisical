import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { InternalCaType } from "../certificate-authority-enums";
import { rebuildCaCrlAfterChange } from "../certificate-authority-fns";
import { internalCertificateAuthorityServiceFactory } from "./internal-certificate-authority-service";

vi.mock("../certificate-authority-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../certificate-authority-fns")>()),
  rebuildCaCrlAfterChange: vi.fn(async () => undefined)
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const CA_ID = "ca-1";
const PROJECT_ID = "project-1";
const STORED_CRL_VALIDITY_DAYS = 7;

const buildService = ({
  caCrl = false,
  storedCrlValidityDays = STORED_CRL_VALIDITY_DAYS,
  notAfter = null as Date | null
} = {}) => {
  const calls: string[] = [];
  vi.mocked(rebuildCaCrlAfterChange).mockImplementation(async () => {
    calls.push("rebuild");
  });

  const ca = {
    id: CA_ID,
    name: "root-ca",
    projectId: PROJECT_ID,
    enableDirectIssuance: true,
    internalCa: { id: "internal-1", crlValidityDays: storedCrlValidityDays, crlDistributionPointUrls: [], notAfter }
  };

  const internalCertificateAuthorityDAL = {
    update: vi.fn(async () => {
      calls.push("store");
      return [];
    })
  };

  const service = internalCertificateAuthorityServiceFactory({
    certificateAuthorityDAL: {
      findByIdWithAssociatedCa: vi.fn(async () => ca),
      updateById: vi.fn(),
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => {
        const result = await cb({});
        calls.push("commit");
        return result;
      }),
      countCasByOrgId: vi.fn(async () => 0),
      countInternalCasByOrgId: vi.fn(async () => 0)
    },
    internalCertificateAuthorityDAL,
    projectDAL: { findById: vi.fn(async () => ({ id: PROJECT_ID, orgId: "org-1" })) },
    licenseService: {
      getPlan: vi.fn(async () => ({ caCrl, pkiOcsp: false, maxCas: null, maxInternalCas: null })),
      getInstanceType: vi.fn()
    }
  } as never);

  return { service, calls, internalCertificateAuthorityDAL };
};

describe("internal CA CRL validity", () => {
  test("refuses to change the validity on a plan without CRLs and stores nothing", async () => {
    const { service, calls } = buildService({ caCrl: false });

    await expect(service.updateCaById({ isInternal: true, caId: CA_ID, crlValidityDays: 30 })).rejects.toBeInstanceOf(
      BadRequestError
    );
    expect(calls).toEqual([]);
  });

  test("accepts the stored validity resent on a plan without CRLs and does not rebuild", async () => {
    const { service, calls } = buildService({ caCrl: false });

    await service.updateCaById({ isInternal: true, caId: CA_ID, crlValidityDays: STORED_CRL_VALIDITY_DAYS });

    expect(calls).toEqual(["store", "commit"]);
  });

  test("lets a plan without CRLs move a custom validity back to the default", async () => {
    const { service, calls } = buildService({ caCrl: false, storedCrlValidityDays: 30 });

    await service.updateCaById({ isInternal: true, caId: CA_ID, crlValidityDays: STORED_CRL_VALIDITY_DAYS });

    expect(calls).toEqual(["store", "commit", "rebuild"]);
  });

  test("refuses a validity change on an expired CA and stores nothing", async () => {
    const { service, calls } = buildService({ caCrl: true, notAfter: new Date(Date.now() - 60_000) });

    await expect(service.updateCaById({ isInternal: true, caId: CA_ID, crlValidityDays: 30 })).rejects.toThrow(
      "expired"
    );
    expect(calls).toEqual([]);
  });

  test("rebuilds the CRL after the new validity is committed", async () => {
    const { service, calls } = buildService({ caCrl: true });

    await service.updateCaById({ isInternal: true, caId: CA_ID, crlValidityDays: 1 });

    expect(calls).toEqual(["store", "commit", "rebuild"]);
  });

  test("refuses to create a CA with a custom validity on a plan without CRLs", async () => {
    const { service } = buildService({ caCrl: false });

    await expect(
      service.createCa({
        isInternal: true,
        projectId: PROJECT_ID,
        type: InternalCaType.ROOT,
        commonName: "Root CA",
        organization: "",
        ou: "",
        country: "",
        province: "",
        locality: "",
        keyAlgorithm: CertKeyAlgorithm.ECDSA_P256,
        crlValidityDays: 30
      })
    ).rejects.toThrow("CRL validity");
  });
});
