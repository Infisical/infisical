import * as x509 from "@peculiar/x509";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { isSignerCertIssuedByCa } from "@app/ee/services/pki-scep/pki-scep-fns";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { KerberosFailureReason } from "@app/lib/kerberos";
import {
  buildTestKeytab,
  buildTestKeytabEntry,
  buildTestNegotiateHeader,
  TEST_DOMAIN_SID
} from "@app/lib/kerberos/kerberos.test-helpers";
import { findDirectoryComputerBySid } from "@app/services/app-connection/ldap/ldap-directory-fns";
import { getCaCertChain } from "@app/services/certificate-authority/certificate-authority-fns";
import { CertificateIssuanceOperation } from "@app/services/certificate-common/certificate-constants";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { learnServerChannelBindings } from "./microsoft-autoenrollment-channel-binding-fns";
import { parseEnrollmentRequestToken } from "./microsoft-autoenrollment-cmc-fns";
import { resolveInstanceServicePrincipalName } from "./microsoft-autoenrollment-fns";
import { microsoftAutoenrollmentServiceFactory } from "./microsoft-autoenrollment-service";
import { buildSidSecurityExtension, buildTemplateOid } from "./microsoft-autoenrollment-template-fns";
import {
  MicrosoftAutoenrollmentFailureReason,
  MicrosoftAutoenrollmentIssuanceResult,
  MicrosoftAutoenrollmentMetadataKey
} from "./microsoft-autoenrollment-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.example.com" }) }));

vi.mock("@app/lib/logger", () => ({ logger: { warn: vi.fn() } }));

vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-id")
}));

vi.mock("@app/services/certificate-authority/certificate-authority-fns", async (importOriginal) => ({
  assertCaInProfileProject: (
    await importOriginal<typeof import("@app/services/certificate-authority/certificate-authority-fns")>()
  ).assertCaInProfileProject,
  getCaCertChain: vi.fn()
}));

vi.mock("@app/services/app-connection/ldap/ldap-directory-fns", () => ({ findDirectoryComputerBySid: vi.fn() }));

vi.mock("@app/ee/services/pki-scep/pki-scep-fns", () => ({ isSignerCertIssuedByCa: vi.fn() }));

vi.mock("./microsoft-autoenrollment-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./microsoft-autoenrollment-fns")>()),
  loadLdapConnectionConfig: vi.fn().mockResolvedValue({}),
  resolveInstanceServicePrincipalName: vi.fn().mockResolvedValue("HTTP/app.example.com")
}));

vi.mock("./microsoft-autoenrollment-channel-binding-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./microsoft-autoenrollment-channel-binding-fns")>()),
  learnServerChannelBindings: vi.fn()
}));

vi.mock("./microsoft-autoenrollment-cmc-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./microsoft-autoenrollment-cmc-fns")>();
  return { parseEnrollmentRequestToken: vi.fn(actual.parseEnrollmentRequestToken) };
});

const APPLICATION_ID = "5b0f7a52-1f43-4c55-9a8e-0f6b8f2f6a11";
const PROFILE_ID = "8d3c2b1a-0f9e-4d8c-b7a6-5f4e3d2c1b0a";
const JUNCTION_ID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const CA_ID = "ca-id";
const COMPUTER_SID = `${TEST_DOMAIN_SID}-1105`;
const DNS_HOST_NAME = "laptop01.corp.example.com";
const MESSAGE_ID = "urn:uuid:0d5a1441-5891-453b-becf-a2e5f6ea3749";
const CERTIFICATE_REQUEST_ID = "7a6c2f0e-3c1d-4b8e-9f1a-2b3c4d5e6f70";
const REQUEST_NUMBER = "923";
const RSA_SHA256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

type TRefusalAuditLog = { event: { type: EventType; metadata: { reason: string } } };

type TSignResult = { status: CertificateRequestStatus; certificateRequestId: string } & Record<string, unknown>;

const ISSUANCE_TX = { isTransaction: true };

const GET_POLICIES_ACTION = "http://schemas.microsoft.com/windows/pki/2009/01/enrollmentpolicy/IPolicy/GetPolicies";

const envelope = (body: string, action = "http://schemas.microsoft.com/windows/pki/2009/01/enrollment/RST/wstep") =>
  `<s:Envelope xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Header><a:Action s:mustUnderstand="1">${action}</a:Action><a:MessageID>${MESSAGE_ID}</a:MessageID></s:Header><s:Body>${body}</s:Body></s:Envelope>`;

const GET_POLICIES_CONTENT = `<GetPolicies xmlns="http://schemas.microsoft.com/windows/pki/2009/01/enrollmentpolicy"><client/></GetPolicies>`;
const GET_POLICIES_BODY = envelope(GET_POLICIES_CONTENT, GET_POLICIES_ACTION);

const issueBody = (token: Buffer) =>
  envelope(
    `<RequestSecurityToken><RequestType>http://docs.oasis-open.org/ws-sx/ws-trust/200512/Issue</RequestType><BinarySecurityToken>${token.toString(
      "base64"
    )}</BinarySecurityToken></RequestSecurityToken>`
  );

const queryBody = (requestId: string) =>
  envelope(
    `<RequestSecurityToken><RequestType>http://schemas.microsoft.com/windows/pki/2009/01/enrollment/QueryTokenStatus</RequestType><RequestID>${requestId}</RequestID></RequestSecurityToken>`
  );

const generateKeys = () =>
  globalThis.crypto.subtle.generateKey(
    { ...RSA_SHA256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"]
  );

const buildCsr = async (name?: string) =>
  Buffer.from(
    (
      await x509.Pkcs10CertificateRequestGenerator.create({
        name,
        keys: await generateKeys(),
        signingAlgorithm: RSA_SHA256
      })
    ).rawData
  );

const buildCertificate = async (commonName: string, computerSid?: string) => {
  const sidExtension = computerSid ? buildSidSecurityExtension(computerSid) : undefined;
  return x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "0a1b2c3d",
    name: `CN=${commonName}`,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    signingAlgorithm: RSA_SHA256,
    keys: await generateKeys(),
    extensions: sidExtension
      ? [new x509.Extension(sidExtension.oid, sidExtension.critical, new Uint8Array(sidExtension.value))]
      : []
  });
};

describe("microsoftAutoenrollmentService", () => {
  const keytabEntry = buildTestKeytabEntry();
  const keytab = buildTestKeytab([keytabEntry]);
  let caCertificate: x509.X509Certificate;
  let plainCsr: Buffer;

  const usedReplayKeys = new Set<string>();
  const keyStoreItems = new Map<string, string>();
  const config = {
    id: "config-id",
    templateMajorRevision: 100,
    templateMinorRevision: 0,
    renewBeforeDays: 42,
    allowedGroups: [] as { sid: string; name: string | null }[],
    servicePrincipalName: `${keytabEntry.principal}@${keytabEntry.realm}`,
    keyVersion: keytabEntry.keyVersion,
    encryptedKeytab: Buffer.from("encrypted-keytab"),
    appConnectionId: "connection-id"
  };

  const deps = {
    pkiApplicationProfileDAL: { findOneByApplicationAndProfile: vi.fn() },
    pkiApplicationDAL: { findById: vi.fn().mockResolvedValue({ id: APPLICATION_ID, name: "Windows fleet" }) },
    microsoftAutoenrollmentEnrollmentConfigDAL: {
      findById: vi.fn(),
      recordKeytabMismatch: vi.fn()
    },
    microsoftAutoenrollmentRequestDAL: {
      createRequestNumber: vi.fn(),
      findCertificateRequestIdByRequestNumber: vi.fn()
    },
    certificateProfileDAL: { findByIdWithConfigs: vi.fn() },
    certificatePolicyDAL: { findById: vi.fn() },
    certificateAuthorityDAL: { findById: vi.fn(), findByIdWithAssociatedCa: vi.fn() },
    certificateAuthorityCertDAL: { find: vi.fn(), findById: vi.fn() },
    certificateDAL: { findOne: vi.fn(), transaction: vi.fn(), primaryNode: vi.fn() },
    certificateRequestDAL: { findById: vi.fn() },
    certificateBodyDAL: { findOne: vi.fn() },
    resourceMetadataDAL: { find: vi.fn() },
    certificateV3Service: { signCertificateFromProfile: vi.fn() },
    projectDAL: { findOne: vi.fn(), updateById: vi.fn(), transaction: vi.fn() },
    kmsService: { decryptWithKmsKey: vi.fn(), generateKmsKey: vi.fn(), createCipherPairWithDataKey: vi.fn() },
    appConnectionDAL: { findById: vi.fn() },
    gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() },
    gatewayPoolService: { resolveEffectiveGatewayId: vi.fn() },
    keyStore: { setItemWithExpiryNX: vi.fn(), getItem: vi.fn(), setItemWithExpiry: vi.fn() },
    auditLogService: { createAuditLog: vi.fn(), createCollapsedAuditLog: vi.fn() }
  };

  const createService = () =>
    microsoftAutoenrollmentServiceFactory(
      deps as unknown as Parameters<typeof microsoftAutoenrollmentServiceFactory>[0]
    );

  let service = createService();

  const buildAuthorization = (overrides: Partial<Parameters<typeof buildTestNegotiateHeader>[0]> = {}) =>
    buildTestNegotiateHeader({ serviceKey: keytabEntry.key, ...overrides }).authorizationHeader;

  const request = (body: string, authorizationHeader: string | undefined = buildAuthorization()) => ({
    applicationId: APPLICATION_ID,
    profileId: PROFILE_ID,
    authorizationHeader,
    body,
    clientIp: "10.0.0.5"
  });

  const issuanceAuditLog = () => {
    const [[auditLog]] = deps.auditLogService.createAuditLog.mock.calls as [
      [{ event: { type: EventType; metadata: Record<string, unknown> } }]
    ];
    return auditLog.event;
  };

  const signsWith = (result: TSignResult) =>
    deps.certificateV3Service.signCertificateFromProfile.mockImplementation(
      async ({
        onCertificateRequestPersisted
      }: {
        onCertificateRequestPersisted?: (certificateRequestId: string, tx: unknown) => Promise<void>;
      }) => {
        await onCertificateRequestPersisted?.(result.certificateRequestId, ISSUANCE_TX);
        return result;
      }
    );

  const refusalReasons = () =>
    (deps.auditLogService.createCollapsedAuditLog.mock.calls as [TRefusalAuditLog][]).map(([log]) => {
      expect(log.event.type).toBe(EventType.MICROSOFT_AUTOENROLLMENT_REQUEST_REFUSED);
      return log.event.metadata.reason;
    });

  beforeAll(async () => {
    x509.cryptoProvider.set(globalThis.crypto);
    caCertificate = await buildCertificate("Example Issuing CA");
    plainCsr = await buildCsr();
    vi.mocked(getCaCertChain).mockResolvedValue({ caCert: caCertificate.toString("pem") } as Awaited<
      ReturnType<typeof getCaCertChain>
    >);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
    usedReplayKeys.clear();
    keyStoreItems.clear();
    config.allowedGroups = [];
    vi.spyOn(crypto, "isFipsModeEnabled").mockReturnValue(false);
    vi.mocked(learnServerChannelBindings).mockResolvedValue([]);
    deps.keyStore.getItem.mockImplementation(async (key: string) => keyStoreItems.get(key) ?? null);
    deps.keyStore.setItemWithExpiry.mockImplementation(async (key: string, _expiry: number, value: string) => {
      keyStoreItems.set(key, value);
      return "OK";
    });
    deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
      id: JUNCTION_ID,
      microsoftAutoenrollmentConfigId: config.id
    });
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue(config);
    deps.microsoftAutoenrollmentRequestDAL.createRequestNumber.mockResolvedValue(Number(REQUEST_NUMBER));
    deps.certificateProfileDAL.findByIdWithConfigs.mockResolvedValue({
      id: PROFILE_ID,
      projectId: "project-id",
      caId: CA_ID,
      slug: "web-servers",
      certificatePolicyId: "policy-id",
      defaults: { ttlDays: 30 }
    });
    deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: undefined });
    deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
      projectId: "project-id",
      internalCa: { activeCaCertId: "ca-cert-id" }
    });
    deps.projectDAL.findOne.mockResolvedValue({ id: "project-id", orgId: "org-id" });
    deps.kmsService.decryptWithKmsKey.mockResolvedValue(async () => keytab);
    deps.keyStore.setItemWithExpiryNX.mockImplementation(async (key: string) => {
      if (usedReplayKeys.has(key)) return null;
      usedReplayKeys.add(key);
      return "OK";
    });
    vi.mocked(findDirectoryComputerBySid).mockResolvedValue({
      dnsHostName: "LAPTOP01.corp.example.com",
      isDisabled: false,
      samAccountName: "LAPTOP01$"
    });
    signsWith({
      status: CertificateRequestStatus.ISSUED,
      certificate: caCertificate.toString("pem"),
      certificateChain: caCertificate.toString("pem"),
      certificateId: "certificate-id",
      serialNumber: "0a1b2c3d",
      certificateRequestId: CERTIFICATE_REQUEST_ID
    });
  });

  describe("before authentication", () => {
    test("answers 404 when the profile does not have Microsoft Autoenrollment turned on", async () => {
      deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
        id: JUNCTION_ID,
        microsoftAutoenrollmentConfigId: null
      });

      const response = await service.getPolicies(request(GET_POLICIES_BODY));

      expect(response.statusCode).toBe(404);
      expect(deps.keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
    });
  });

  describe("Kerberos authentication", () => {
    test("asks for a ticket when there is no Authorization header", async () => {
      const response = await service.getPolicies(request(GET_POLICIES_BODY, ""));

      expect(response.statusCode).toBe(401);
      expect(response.headers["WWW-Authenticate"]).toBe("Negotiate");
      expect(refusalReasons()).toEqual([KerberosFailureReason.NoTicket]);
      expect(deps.kmsService.decryptWithKmsKey).not.toHaveBeenCalled();
      expect(learnServerChannelBindings).not.toHaveBeenCalled();
    });

    test("asks for a ticket without decrypting the keytab when the Authorization header is not Negotiate", async () => {
      const response = await service.getPolicies(request(GET_POLICIES_BODY, "Basic dXNlcjpwYXNz"));

      expect(response.statusCode).toBe(401);
      expect(refusalReasons()).toEqual([KerberosFailureReason.NoTicket]);
      expect(deps.kmsService.decryptWithKmsKey).not.toHaveBeenCalled();
    });

    test("refuses a replayed authenticator", async () => {
      const authorizationHeader = buildAuthorization();

      expect((await service.getPolicies(request(GET_POLICIES_BODY, authorizationHeader))).statusCode).toBe(200);
      const replayed = await service.getPolicies(request(GET_POLICIES_BODY, authorizationHeader));

      expect(replayed.statusCode).toBe(401);
      expect(refusalReasons()).toEqual([KerberosFailureReason.Replay]);
    });

    test("records a keytab mismatch when computers ask for the instance's name and the keytab is for another", async () => {
      vi.mocked(resolveInstanceServicePrincipalName).mockResolvedValueOnce("HTTP/infisical.example.com");
      const response = await service.getPolicies(
        request(GET_POLICIES_BODY, buildAuthorization({ serviceName: "HTTP/infisical.example.com" }))
      );

      expect(response.statusCode).toBe(401);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.recordKeytabMismatch).toHaveBeenCalledWith(
        config.id,
        "HTTP/infisical.example.com"
      );
      expect(refusalReasons()).toEqual([KerberosFailureReason.NoMatchingKey]);
    });

    test("does not record a mismatch for a ticket that asks for a name other than the instance's", async () => {
      const response = await service.getPolicies(
        request(GET_POLICIES_BODY, buildAuthorization({ serviceName: "HTTP/attacker.example.com" }))
      );

      expect(response.statusCode).toBe(401);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.recordKeytabMismatch).not.toHaveBeenCalled();
      expect(refusalReasons()).toEqual([KerberosFailureReason.NoMatchingKey]);
    });

    test("does not record a mismatch for a ticket service name that is not an HTTP host name", async () => {
      const response = await service.getPolicies(
        request(GET_POLICIES_BODY, buildAuthorization({ serviceName: "HTTP/x.example.com -mapuser evil" }))
      );

      expect(response.statusCode).toBe(401);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.recordKeytabMismatch).not.toHaveBeenCalled();
      expect(refusalReasons()).toEqual([KerberosFailureReason.NoMatchingKey]);
    });

    test("does not record a mismatch for the right service principal with another key version", async () => {
      const response = await service.getPolicies(request(GET_POLICIES_BODY, buildAuthorization({ keyVersion: 4 })));

      expect(response.statusCode).toBe(401);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.recordKeytabMismatch).not.toHaveBeenCalled();
      expect(refusalReasons()).toEqual([KerberosFailureReason.NoMatchingKey]);
    });
  });

  describe("TLS channel binding", () => {
    const CHANNEL_BINDINGS_KEY = KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindings("app.example.com:443");
    const SERVER_BINDING = Buffer.alloc(16, 0x11);
    const ROTATED_BINDING = Buffer.alloc(16, 0x22);
    const RELAYED_BINDING = Buffer.alloc(16, 0x33);
    const HOUR_MS = 60 * 60 * 1000;

    const cacheBindings = (entries: { binding: Buffer; ageMs: number }[]) =>
      keyStoreItems.set(
        CHANNEL_BINDINGS_KEY,
        JSON.stringify(
          entries.map(({ binding, ageMs }) => ({
            binding: binding.toString("hex"),
            seenAt: new Date(Date.now() - ageMs).toISOString()
          }))
        )
      );

    const cachedBindings = () =>
      (JSON.parse(keyStoreItems.get(CHANNEL_BINDINGS_KEY) ?? "[]") as { binding: string }[]).map(
        ({ binding }) => binding
      );

    let authenticatorMicroseconds = 0;
    const getPoliciesBoundTo = (channelBinding: Buffer) => {
      authenticatorMicroseconds += 1;
      return service.getPolicies(
        request(GET_POLICIES_BODY, buildAuthorization({ channelBinding, microseconds: authenticatorMicroseconds }))
      );
    };

    const replayKeysWritten = () =>
      [...usedReplayKeys].filter((key) => key.startsWith("microsoft-autoenrollment-replay:"));

    test("learns the instance's certificates and accepts a request bound to one of them", async () => {
      vi.mocked(learnServerChannelBindings).mockResolvedValue([SERVER_BINDING.toString("hex")]);

      const response = await getPoliciesBoundTo(SERVER_BINDING);

      expect(response.statusCode).toBe(200);
      expect(learnServerChannelBindings).toHaveBeenCalledExactlyOnceWith({ host: "app.example.com", port: 443 });
      expect(cachedBindings()).toEqual([SERVER_BINDING.toString("hex")]);
    });

    test("uses fresh cached certificates without reading them again", async () => {
      cacheBindings([{ binding: SERVER_BINDING, ageMs: 0 }]);

      const response = await getPoliciesBoundTo(SERVER_BINDING);

      expect(response.statusCode).toBe(200);
      expect(learnServerChannelBindings).not.toHaveBeenCalled();
    });

    test("refuses a request bound to another certificate after one rate-limited read, without using its authenticator", async () => {
      cacheBindings([{ binding: SERVER_BINDING, ageMs: 0 }]);
      vi.mocked(learnServerChannelBindings).mockResolvedValue([SERVER_BINDING.toString("hex")]);

      const first = await getPoliciesBoundTo(RELAYED_BINDING);
      const second = await getPoliciesBoundTo(RELAYED_BINDING);

      expect(first.statusCode).toBe(401);
      expect(second.statusCode).toBe(401);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
      expect(replayKeysWritten()).toEqual([]);
      expect(refusalReasons()).toEqual([
        KerberosFailureReason.ChannelBindingMismatch,
        KerberosFailureReason.ChannelBindingMismatch
      ]);
      const [[refusal]] = deps.auditLogService.createCollapsedAuditLog.mock.calls as [
        [{ event: { metadata: { message: string } } }]
      ];
      expect(refusal.event.metadata.message).toContain("app.example.com");
      expect(refusal.event.metadata.message).toContain("Exclude app.example.com from HTTPS inspection");
    });

    test("accepts a request bound to a rotated certificate once the read finds it", async () => {
      cacheBindings([{ binding: SERVER_BINDING, ageMs: 0 }]);
      vi.mocked(learnServerChannelBindings).mockResolvedValue([ROTATED_BINDING.toString("hex")]);

      const response = await getPoliciesBoundTo(ROTATED_BINDING);

      expect(response.statusCode).toBe(200);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
      expect(cachedBindings()).toEqual([ROTATED_BINDING.toString("hex"), SERVER_BINDING.toString("hex")]);
    });

    test("keeps certificates seen in the last 24 hours when it reads them again, and drops older ones", async () => {
      cacheBindings([
        { binding: SERVER_BINDING, ageMs: 2 * HOUR_MS },
        { binding: RELAYED_BINDING, ageMs: 25 * HOUR_MS }
      ]);
      vi.mocked(learnServerChannelBindings).mockResolvedValue([ROTATED_BINDING.toString("hex")]);

      expect((await getPoliciesBoundTo(SERVER_BINDING)).statusCode).toBe(200);
      await vi.waitFor(() =>
        expect(cachedBindings()).toEqual([ROTATED_BINDING.toString("hex"), SERVER_BINDING.toString("hex")])
      );
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
      expect((await getPoliciesBoundTo(RELAYED_BINDING)).statusCode).toBe(401);
    });

    test("answers from stale cached certificates without waiting for them to be read again", async () => {
      cacheBindings([{ binding: SERVER_BINDING, ageMs: 2 * HOUR_MS }]);
      const neverSettles = new Promise<string[]>((resolve) => {
        setTimeout(() => resolve([]), 60 * 60 * 1000).unref();
      });
      vi.mocked(learnServerChannelBindings).mockReturnValue(neverSettles);

      const response = await getPoliciesBoundTo(SERVER_BINDING);

      expect(response.statusCode).toBe(200);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
    });

    test("a mismatch refetch while another refresh holds the lock waits for this instance's learn already in progress", async () => {
      cacheBindings([{ binding: SERVER_BINDING, ageMs: 2 * HOUR_MS }]);
      vi.mocked(learnServerChannelBindings).mockResolvedValue([ROTATED_BINDING.toString("hex")]);

      const response = await getPoliciesBoundTo(ROTATED_BINDING);

      expect(response.statusCode).toBe(200);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
    });

    test("reads the certificates again when the cache is gone, even while another refresh holds the lock", async () => {
      usedReplayKeys.add(
        KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsRefreshLock("app.example.com:443")
      );
      vi.mocked(learnServerChannelBindings).mockResolvedValue([SERVER_BINDING.toString("hex")]);

      const response = await getPoliciesBoundTo(RELAYED_BINDING);

      expect(response.statusCode).toBe(401);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
      expect(refusalReasons()).toEqual([KerberosFailureReason.ChannelBindingMismatch]);
    });

    test("reads the certificates once for concurrent requests on an empty cache", async () => {
      vi.mocked(learnServerChannelBindings).mockResolvedValue([SERVER_BINDING.toString("hex")]);

      const responses = await Promise.all([getPoliciesBoundTo(SERVER_BINDING), getPoliciesBoundTo(SERVER_BINDING)]);

      expect(responses.map(({ statusCode }) => statusCode)).toEqual([200, 200]);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
    });

    test("checks only that a binding is present in FIPS mode", async () => {
      vi.mocked(crypto.isFipsModeEnabled).mockReturnValue(true);
      cacheBindings([{ binding: SERVER_BINDING, ageMs: 0 }]);

      const response = await getPoliciesBoundTo(RELAYED_BINDING);

      expect(response.statusCode).toBe(200);
      expect(learnServerChannelBindings).not.toHaveBeenCalled();
    });

    test("checks only that a binding is present when the instance's certificate cannot be read", async () => {
      vi.mocked(learnServerChannelBindings).mockRejectedValue(new Error("connect ECONNREFUSED"));

      const response = await getPoliciesBoundTo(RELAYED_BINDING);

      expect(response.statusCode).toBe(200);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
      expect(keyStoreItems.has(CHANNEL_BINDINGS_KEY)).toBe(false);

      expect((await getPoliciesBoundTo(RELAYED_BINDING)).statusCode).toBe(200);
      expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
    });

    test("still refuses a request with no channel binding when the certificate cannot be read", async () => {
      const response = await service.getPolicies(request(GET_POLICIES_BODY, buildAuthorization({ checksum: null })));

      expect(response.statusCode).toBe(401);
      expect(refusalReasons()).toEqual([KerberosFailureReason.MissingChannelBinding]);
    });
  });

  describe("getPolicies", () => {
    test("lists the profile's template and answers with a mutual authentication token", async () => {
      const response = await service.getPolicies(request(GET_POLICIES_BODY));

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`<a:RelatesTo>${MESSAGE_ID}</a:RelatesTo>`);
      expect(response.body).toContain(`<value>${buildTemplateOid(JUNCTION_ID)}</value>`);
      expect(response.headers["WWW-Authenticate"]).toMatch(/^Negotiate \S+$/);
      expect(deps.auditLogService.createCollapsedAuditLog).not.toHaveBeenCalled();
    });

    test("answers a request with another action with a fault", async () => {
      const response = await service.getPolicies(
        request(envelope(GET_POLICIES_CONTENT, GET_POLICIES_ACTION.replace("GetPolicies", "Bogus")))
      );

      expect(response.statusCode).toBe(500);
      expect(response.body).toContain("<s:Fault>");
      expect(response.body).not.toContain(buildTemplateOid(JUNCTION_ID));
    });

    test("never offers a renewal period longer than the certificate lifetime", async () => {
      const response = await service.getPolicies(request(GET_POLICIES_BODY));

      expect(response.body).toContain("<validityPeriodSeconds>2592000</validityPeriodSeconds>");
      expect(response.body).toContain(`<renewalPeriodSeconds>${29 * 86400}</renewalPeriodSeconds>`);
    });

    test("offers a one year lifetime when the profile has no default TTL", async () => {
      deps.certificateProfileDAL.findByIdWithConfigs.mockResolvedValue({
        id: PROFILE_ID,
        projectId: "project-id",
        caId: CA_ID,
        slug: "web-servers",
        certificatePolicyId: "policy-id",
        defaults: {}
      });

      const response = await service.getPolicies(request(GET_POLICIES_BODY));

      expect(response.body).toContain(`<validityPeriodSeconds>${365 * 86400}</validityPeriodSeconds>`);
      expect(response.body).toContain(`<renewalPeriodSeconds>${42 * 86400}</renewalPeriodSeconds>`);
    });

    test("caps the one year lifetime at the policy's maximum validity", async () => {
      deps.certificateProfileDAL.findByIdWithConfigs.mockResolvedValue({
        id: PROFILE_ID,
        projectId: "project-id",
        caId: CA_ID,
        slug: "web-servers",
        certificatePolicyId: "policy-id",
        defaults: {}
      });
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "30d" } });

      const response = await service.getPolicies(request(GET_POLICIES_BODY));

      expect(response.body).toContain(`<validityPeriodSeconds>${30 * 86400}</validityPeriodSeconds>`);
    });

    test("lists no template for a computer outside the allowed groups", async () => {
      config.allowedGroups = [{ sid: `${TEST_DOMAIN_SID}-1200`, name: null }];

      const response = await service.getPolicies(request(GET_POLICIES_BODY));

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain(buildTemplateOid(JUNCTION_ID));
      expect(refusalReasons()).toEqual([MicrosoftAutoenrollmentFailureReason.NotInAllowedGroup]);
    });

    test("lists the template for a computer in an allowed group", async () => {
      config.allowedGroups = [{ sid: `${TEST_DOMAIN_SID}-515`, name: null }];

      const response = await service.getPolicies(request(GET_POLICIES_BODY));

      expect(response.body).toContain(buildTemplateOid(JUNCTION_ID));
    });
  });

  describe("requestSecurityToken issuance", () => {
    test("issues for the name Active Directory holds, not the one the request carries", async () => {
      const response = await service.requestSecurityToken(
        request(issueBody(await buildCsr("CN=dc01.corp.example.com")))
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Issued");
      const [signInput] = deps.certificateV3Service.signCertificateFromProfile.mock.calls[0] as [
        {
          issuerNameOverride: { commonName: string };
          metadata: { key: string; value: string }[];
          additionalExtensions: { oid: string; value: Buffer }[];
        }
      ];
      expect(signInput.issuerNameOverride.commonName).toBe(DNS_HOST_NAME);
      expect(signInput.additionalExtensions).toContainEqual(buildSidSecurityExtension(COMPUTER_SID));
      expect(signInput.metadata).toContainEqual({
        key: MicrosoftAutoenrollmentMetadataKey.ComputerSid,
        value: COMPUTER_SID
      });
      expect(issuanceAuditLog().type).toBe(EventType.MICROSOFT_AUTOENROLLMENT_ISSUANCE);
      expect(issuanceAuditLog().metadata).toMatchObject({ profileName: "web-servers", serialNumber: "0a1b2c3d" });
    });

    test("creates the request number in the issuance transaction and audits it after commit", async () => {
      const response = await service.requestSecurityToken(request(issueBody(plainCsr)));

      expect(response.body).toContain(`>${REQUEST_NUMBER}</RequestID>`);
      expect(deps.microsoftAutoenrollmentRequestDAL.createRequestNumber).toHaveBeenCalledWith(
        CERTIFICATE_REQUEST_ID,
        ISSUANCE_TX
      );
      expect(issuanceAuditLog().metadata).toMatchObject({ requestNumber: REQUEST_NUMBER });
    });

    test("fails the issuance without an audit when the request number can't be stored", async () => {
      deps.microsoftAutoenrollmentRequestDAL.createRequestNumber.mockRejectedValue(new Error("database down"));

      await expect(service.requestSecurityToken(request(issueBody(plainCsr)))).rejects.toThrow("database down");

      expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
    });

    test("refuses to answer when the certificate request was saved without a request number", async () => {
      deps.certificateV3Service.signCertificateFromProfile.mockResolvedValue({
        status: CertificateRequestStatus.ISSUED,
        certificateRequestId: CERTIFICATE_REQUEST_ID
      });

      await expect(service.requestSecurityToken(request(issueBody(plainCsr)))).rejects.toThrow(
        "saved without a request number"
      );
      expect(deps.auditLogService.createAuditLog).not.toHaveBeenCalled();
    });

    test("answers pending with a numeric request id when an approval policy holds the request", async () => {
      signsWith({
        status: CertificateRequestStatus.PENDING_APPROVAL,
        certificateRequestId: CERTIFICATE_REQUEST_ID
      });

      const response = await service.requestSecurityToken(request(issueBody(plainCsr)));

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`>${REQUEST_NUMBER}</RequestID>`);
      expect(deps.microsoftAutoenrollmentRequestDAL.createRequestNumber).toHaveBeenCalledWith(
        CERTIFICATE_REQUEST_ID,
        ISSUANCE_TX
      );
      expect(issuanceAuditLog().metadata).toMatchObject({
        result: MicrosoftAutoenrollmentIssuanceResult.Pending,
        requestNumber: REQUEST_NUMBER
      });
      expect(response.body).not.toContain("<RequestedSecurityToken><BinarySecurityToken");
    });

    test("refuses a computer outside the allowed groups before reading Active Directory", async () => {
      config.allowedGroups = [{ sid: `${TEST_DOMAIN_SID}-1200`, name: null }];

      const response = await service.requestSecurityToken(request(issueBody(plainCsr)));

      expect(response.statusCode).toBe(500);
      expect(findDirectoryComputerBySid).not.toHaveBeenCalled();
      expect(refusalReasons()).toEqual([MicrosoftAutoenrollmentFailureReason.NotInAllowedGroup]);
    });

    test.each([
      ["Active Directory is unreachable", "reject", MicrosoftAutoenrollmentFailureReason.DirectoryUnreachable],
      ["the computer is not in Active Directory", null, MicrosoftAutoenrollmentFailureReason.ComputerNotFound],
      [
        "the computer is disabled",
        { dnsHostName: DNS_HOST_NAME, isDisabled: true, samAccountName: "LAPTOP01$" },
        MicrosoftAutoenrollmentFailureReason.ComputerDisabled
      ],
      [
        "the computer has no DNS host name",
        { dnsHostName: null, isDisabled: false, samAccountName: "LAPTOP01$" },
        MicrosoftAutoenrollmentFailureReason.NoDnsHostName
      ],
      [
        "the LDAP account cannot read userAccountControl",
        { dnsHostName: DNS_HOST_NAME, isDisabled: null, samAccountName: "LAPTOP01$" },
        MicrosoftAutoenrollmentFailureReason.DirectoryLookupFailed
      ]
    ])("refuses when %s", async (_name, computer, reason) => {
      if (computer === "reject") {
        vi.mocked(findDirectoryComputerBySid).mockRejectedValue(new Error("connect ECONNREFUSED"));
      } else {
        vi.mocked(findDirectoryComputerBySid).mockResolvedValue(
          computer as Awaited<ReturnType<typeof findDirectoryComputerBySid>>
        );
      }

      const response = await service.requestSecurityToken(request(issueBody(plainCsr)));

      expect(response.statusCode).toBe(500);
      expect(response.body).toContain("<s:Fault>");
      expect(deps.certificateV3Service.signCertificateFromProfile).not.toHaveBeenCalled();
      expect(refusalReasons()).toEqual([reason]);
    });

    test("points the computer at the LDAP connection settings without echoing the directory's own error text", async () => {
      vi.mocked(findDirectoryComputerBySid).mockRejectedValue(
        new BadRequestError({ message: "Unable to read from the directory: 80090308: LdapErr: DSID-0C09042A" })
      );

      const response = await service.requestSecurityToken(request(issueBody(plainCsr)));

      expect(response.body).toContain("could not look up this computer in Active Directory");
      expect(response.body).not.toContain("LdapErr");
      expect(response.body).not.toContain("could not reach Active Directory");
    });

    test("answers a malformed certificate request with a fault, not an error", async () => {
      const response = await service.requestSecurityToken(request(issueBody(Buffer.from("not a request"))));

      expect(response.statusCode).toBe(500);
      expect(response.body).toContain(`<a:RelatesTo>${MESSAGE_ID}</a:RelatesTo>`);
    });
  });

  describe("requestSecurityToken renewal", () => {
    const renew = async (currentCommonName: string, currentSid: string | null = COMPUTER_SID) => {
      const currentCertificate = await buildCertificate(currentCommonName, currentSid ?? undefined);
      vi.mocked(parseEnrollmentRequestToken).mockResolvedValueOnce({
        csr: new x509.Pkcs10CertificateRequest(new Uint8Array(plainCsr)),
        currentCertificate
      });
      return service.requestSecurityToken(request(issueBody(plainCsr)));
    };

    test("renews a certificate this profile's CA issued to the computer, even after a rename in AD", async () => {
      vi.mocked(isSignerCertIssuedByCa).mockResolvedValue(true);
      deps.certificateDAL.findOne.mockResolvedValue({ id: "current-certificate-id", deletedAt: null });

      const response = await renew("old-name.corp.example.com");

      expect(response.statusCode).toBe(200);
      expect(deps.certificateDAL.findOne.mock.calls[0][0]).toEqual({
        serialNumber: "0a1b2c3d",
        caId: CA_ID,
        profileId: PROFILE_ID,
        applicationId: APPLICATION_ID
      });
      expect(deps.certificateV3Service.signCertificateFromProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          issuanceOperation: CertificateIssuanceOperation.RENEW,
          originalCertificateId: "current-certificate-id"
        })
      );
      expect(issuanceAuditLog().type).toBe(EventType.MICROSOFT_AUTOENROLLMENT_RENEWAL);
    });

    test.each([
      ["was not issued by the profile's CA or is revoked", false, { id: "current-certificate-id", deletedAt: null }],
      ["is not stored", true, undefined],
      ["was deleted", true, { id: "current-certificate-id", deletedAt: new Date() }]
    ])("refuses to renew a certificate that %s", async (_name, isIssuedByCa, storedCertificate) => {
      vi.mocked(isSignerCertIssuedByCa).mockResolvedValue(isIssuedByCa);
      deps.certificateDAL.findOne.mockResolvedValue(storedCertificate);

      const response = await renew(DNS_HOST_NAME);

      expect(response.statusCode).toBe(500);
      expect(deps.certificateV3Service.signCertificateFromProfile).not.toHaveBeenCalled();
    });

    test.each([
      ["another computer", `${TEST_DOMAIN_SID}-2001`],
      ["no computer", null]
    ])("refuses to renew a certificate issued to %s", async (_name, currentSid) => {
      vi.mocked(isSignerCertIssuedByCa).mockResolvedValue(true);
      deps.certificateDAL.findOne.mockResolvedValue({ id: "current-certificate-id", deletedAt: null });

      const response = await renew(DNS_HOST_NAME, currentSid);

      expect(response.statusCode).toBe(500);
      expect(deps.certificateV3Service.signCertificateFromProfile).not.toHaveBeenCalled();
      expect(refusalReasons()).toEqual([MicrosoftAutoenrollmentFailureReason.RenewalRefused]);
    });
  });

  describe("requestSecurityToken QueryTokenStatus", () => {
    const pendingRequest = {
      id: CERTIFICATE_REQUEST_ID,
      profileId: PROFILE_ID,
      applicationId: APPLICATION_ID,
      status: CertificateRequestStatus.PENDING_APPROVAL,
      certificateId: null
    };

    beforeEach(() => {
      deps.microsoftAutoenrollmentRequestDAL.findCertificateRequestIdByRequestNumber.mockResolvedValue(
        CERTIFICATE_REQUEST_ID
      );
      deps.certificateRequestDAL.findById.mockResolvedValue(pendingRequest);
      deps.resourceMetadataDAL.find.mockResolvedValue([
        { key: MicrosoftAutoenrollmentMetadataKey.ComputerSid, value: COMPUTER_SID }
      ]);
    });

    test("answers pending while the request waits for approval", async () => {
      const response = await service.requestSecurityToken(request(queryBody(REQUEST_NUMBER)));

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(`>${REQUEST_NUMBER}</RequestID>`);
      expect(deps.microsoftAutoenrollmentRequestDAL.findCertificateRequestIdByRequestNumber).toHaveBeenCalledWith(923);
    });

    test("returns the issued certificate once the request is approved", async () => {
      deps.certificateRequestDAL.findById.mockResolvedValue({
        ...pendingRequest,
        status: CertificateRequestStatus.ISSUED,
        certificateId: "certificate-id"
      });
      deps.certificateDAL.findOne.mockResolvedValue({
        id: "certificate-id",
        status: CertStatus.ACTIVE,
        deletedAt: null
      });
      deps.certificateBodyDAL.findOne.mockResolvedValue({
        encryptedCertificate: Buffer.from("certificate"),
        encryptedCertificateChain: null
      });
      deps.kmsService.decryptWithKmsKey.mockResolvedValue(async ({ cipherTextBlob }: { cipherTextBlob: Buffer }) =>
        cipherTextBlob.equals(config.encryptedKeytab) ? keytab : Buffer.from(caCertificate.rawData)
      );

      const response = await service.requestSecurityToken(request(queryBody(REQUEST_NUMBER)));

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(Buffer.from(caCertificate.rawData).toString("base64"));
    });

    test.each([
      ["revoked", { id: "certificate-id", status: CertStatus.REVOKED, deletedAt: null }],
      ["deleted", { id: "certificate-id", status: CertStatus.ACTIVE, deletedAt: new Date() }]
    ])("tells Windows the request was denied when its certificate was %s before pickup", async (_name, issued) => {
      deps.certificateRequestDAL.findById.mockResolvedValue({
        ...pendingRequest,
        status: CertificateRequestStatus.ISSUED,
        certificateId: "certificate-id"
      });
      deps.certificateDAL.findOne.mockResolvedValue(issued);
      deps.certificateBodyDAL.findOne.mockResolvedValue({
        encryptedCertificate: Buffer.from("certificate"),
        encryptedCertificateChain: null
      });

      const response = await service.requestSecurityToken(request(queryBody(REQUEST_NUMBER)));

      expect(response.statusCode).toBe(500);
      expect(response.body).toContain("<ErrorCode>-2146877420</ErrorCode>");
      expect(deps.certificateBodyDAL.findOne).not.toHaveBeenCalled();
    });

    test("refuses a request another computer made", async () => {
      deps.resourceMetadataDAL.find.mockResolvedValue([
        { key: MicrosoftAutoenrollmentMetadataKey.ComputerSid, value: `${TEST_DOMAIN_SID}-2001` }
      ]);

      const response = await service.requestSecurityToken(request(queryBody(REQUEST_NUMBER)));

      expect(response.statusCode).toBe(500);
      expect(response.body).toContain("<ErrorCode>-2146877438</ErrorCode>");
      expect(response.body).toContain("<InvalidRequest>false</InvalidRequest>");
    });

    test.each([
      ["another profile", { ...pendingRequest, profileId: "1d3c2b1a-0f9e-4d8c-b7a6-5f4e3d2c1b0a" }],
      ["another application", { ...pendingRequest, applicationId: "6b0f7a52-1f43-4c55-9a8e-0f6b8f2f6a11" }]
    ])("refuses a request made through %s", async (_name, certificateRequest) => {
      deps.certificateRequestDAL.findById.mockResolvedValue(certificateRequest);

      const response = await service.requestSecurityToken(request(queryBody(REQUEST_NUMBER)));

      expect(response.statusCode).toBe(500);
    });

    test.each([
      ["a UUID", CERTIFICATE_REQUEST_ID],
      ["zero", "0"],
      ["a number above the int32 range", "2147483648"]
    ])("refuses %s as a request id without looking it up", async (_name, requestId) => {
      const response = await service.requestSecurityToken(request(queryBody(requestId)));

      expect(response.statusCode).toBe(500);
      expect(deps.certificateRequestDAL.findById).not.toHaveBeenCalled();
      expect(response.body).toContain("<ErrorCode>-2146877438</ErrorCode>");
    });

    test("tells Windows a rejected request was denied so it stops asking", async () => {
      deps.certificateRequestDAL.findById.mockResolvedValue({
        ...pendingRequest,
        status: CertificateRequestStatus.REJECTED
      });

      const response = await service.requestSecurityToken(request(queryBody(REQUEST_NUMBER)));

      expect(response.statusCode).toBe(500);
      expect(response.body).toContain("RequestSecurityTokenCertificateEnrollmentWSDetailFault");
      expect(response.body).toContain("<ErrorCode>-2146877420</ErrorCode>");
      expect(response.body).toContain("<InvalidRequest>true</InvalidRequest>");
      expect(response.body).toContain(`<RequestID>${REQUEST_NUMBER}</RequestID>`);
      expect(response.body).toContain("was rejected in Infisical");
    });

    test("tells Windows why an approved request could not be issued", async () => {
      deps.certificateRequestDAL.findById.mockResolvedValue({
        ...pendingRequest,
        status: CertificateRequestStatus.FAILED,
        errorMessage: "The certificate authority is disabled."
      });

      const response = await service.requestSecurityToken(request(queryBody(REQUEST_NUMBER)));

      expect(response.statusCode).toBe(500);
      expect(response.body).toContain(
        "was approved, but Infisical could not issue it: The certificate authority is disabled."
      );
      expect(response.body).toContain("<ErrorCode>-2146877420</ErrorCode>");
    });
  });
});
