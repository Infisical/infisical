import { AxiosError, AxiosResponse } from "axios";

import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TAzureDnsConnection } from "@app/services/app-connection/azure-dns/azure-dns-connection-types";

import { AcmeDnsProvider } from "../acme/acme-certificate-authority-enums";
import { azureDnsAppendTxtRecord } from "../acme/dns-providers/azure-dns";
import { DNS_TXT_RECORD_PROVIDERS, TDnsTxtRecordProviderDeps } from "./dns-txt-records";
import { route53AppendTxtRecord } from "./route53";

const {
  route53Send,
  requestGet,
  requestPut,
  cloudflareExistingRecords,
  cloudflareInsert,
  dnsMadeEasyExistingRecords,
  dnsMadeEasyInsert
} = vi.hoisted(() => ({
  route53Send: vi.fn(),
  requestGet: vi.fn(),
  requestPut: vi.fn(),
  cloudflareExistingRecords: vi.fn(),
  cloudflareInsert: vi.fn(),
  dnsMadeEasyExistingRecords: vi.fn(),
  dnsMadeEasyInsert: vi.fn()
}));

vi.mock("@aws-sdk/client-route-53", () => {
  const command = (input: unknown) => ({ input });
  return {
    Route53Client: vi.fn(() => ({ send: route53Send })),
    ChangeResourceRecordSetsCommand: vi.fn(command),
    GetHostedZoneCommand: vi.fn(command),
    ListResourceRecordSetsCommand: vi.fn(command)
  };
});
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn(async () => ({ credentials: {}, region: "us-east-1" }))
}));
vi.mock("@app/lib/crypto/cryptography", () => ({ crypto: { isFipsModeEnabled: () => false } }));
vi.mock("@app/lib/config/request", () => ({
  request: { get: requestGet, put: requestPut },
  createRequestClient: () => ({ get: requestGet, put: requestPut })
}));
vi.mock("@app/services/app-connection/cloudflare/cloudflare-connection-fns", () => ({
  paginateCloudflare: cloudflareExistingRecords,
  listCloudflareZones: vi.fn(),
  getCloudflareErrorMessage: (error: Error) => error.message
}));
vi.mock("../acme/dns-providers/cloudflare", () => ({ cloudflareInsertTxtRecord: cloudflareInsert }));
vi.mock("@app/services/app-connection/dns-made-easy/dns-made-easy-connection-fns", () => ({
  listDNSMadeEasyRecords: dnsMadeEasyExistingRecords,
  listDNSMadeEasyZones: vi.fn()
}));
vi.mock("../acme/dns-providers/dns-made-easy", () => ({ dnsMadeEasyInsertTxtRecord: dnsMadeEasyInsert }));
vi.mock("@app/services/app-connection/azure-dns/azure-dns-connection-fns", () => ({
  getAzureDnsConnectionAccessToken: vi.fn(async () => "token"),
  validateAzureDnsZoneResourceId: vi.fn()
}));

const RECORD_NAME = "_validation-persist.example.com";
const OUR_VALUE = '"digicert.com; accounturi=https://digicert.com/account/ours"';
const OTHER_VALUE = '"digicert.com; accounturi=https://digicert.com/account/other"';

const appendToRoute53 = () =>
  route53AppendTxtRecord(
    {} as TAwsConnectionConfig,
    "Z123",
    { name: RECORD_NAME, value: OUR_VALUE, ttl: 60 },
    {} as TInstanceConfigService
  );

const appendToAzure = () =>
  azureDnsAppendTxtRecord(
    { credentials: { tenantId: "t", clientId: "c", clientSecret: "s" } } as TAzureDnsConnection,
    "/subscriptions/s/resourceGroups/r/providers/Microsoft.Network/dnszones/example.com",
    "_validation-persist",
    OUR_VALUE,
    { signToken: vi.fn() }
  );

const upsertThrough = (provider: AcmeDnsProvider) =>
  DNS_TXT_RECORD_PROVIDERS[provider].upsertTxtRecord(
    { credentials: { apiToken: "token" } } as unknown as TAppConnection,
    { zoneId: "zone-1", zoneName: "example.com", fqdn: RECORD_NAME, value: OUR_VALUE },
    {} as TDnsTxtRecordProviderDeps
  );

describe("TXT record append for the persistent DNS TXT record", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("Route 53 keeps a TXT value someone else wrote and adds ours", async () => {
    route53Send.mockResolvedValueOnce({
      ResourceRecordSets: [
        { Name: `${RECORD_NAME}.`, Type: "TXT", TTL: 300, ResourceRecords: [{ Value: OTHER_VALUE }] }
      ]
    });

    await appendToRoute53();

    const change = (route53Send.mock.calls[1][0] as { input: { ChangeBatch: { Changes: unknown[] } } }).input
      .ChangeBatch.Changes[0];
    expect(change).toEqual(
      expect.objectContaining({
        ResourceRecordSet: expect.objectContaining({
          TTL: 300,
          ResourceRecords: [{ Value: OTHER_VALUE }, { Value: OUR_VALUE }]
        }) as object
      })
    );
  });

  test("Route 53 writes nothing when our value is already there", async () => {
    route53Send.mockResolvedValueOnce({
      ResourceRecordSets: [{ Name: `${RECORD_NAME}.`, Type: "TXT", ResourceRecords: [{ Value: OUR_VALUE }] }]
    });

    await appendToRoute53();

    expect(route53Send).toHaveBeenCalledTimes(1);
  });

  test("Azure DNS keeps a TXT value someone else wrote and adds ours", async () => {
    requestGet.mockResolvedValueOnce({
      data: { properties: { TTL: 300, TXTRecords: [{ value: [OTHER_VALUE.replaceAll('"', "")] }] } }
    });

    await appendToAzure();

    expect(requestPut).toHaveBeenCalledWith(
      expect.any(String),
      {
        properties: {
          TTL: 300,
          TXTRecords: [{ value: [OTHER_VALUE.replaceAll('"', "")] }, { value: [OUR_VALUE.replaceAll('"', "")] }]
        }
      },
      expect.any(Object)
    );
  });

  test("Route 53 writes only ours when the listing starts at the next record name", async () => {
    route53Send.mockResolvedValueOnce({
      ResourceRecordSets: [
        { Name: "www.example.com.", Type: "TXT", TTL: 300, ResourceRecords: [{ Value: OTHER_VALUE }] }
      ]
    });

    await appendToRoute53();

    const change = (route53Send.mock.calls[1][0] as { input: { ChangeBatch: { Changes: unknown[] } } }).input
      .ChangeBatch.Changes[0];
    expect(change).toEqual(
      expect.objectContaining({
        ResourceRecordSet: expect.objectContaining({
          Name: RECORD_NAME,
          TTL: 60,
          ResourceRecords: [{ Value: OUR_VALUE }]
        }) as object
      })
    );
  });

  test("Azure DNS creates the record set when it doesn't exist yet", async () => {
    requestGet.mockRejectedValueOnce(
      new AxiosError("Not Found", "ERR_BAD_REQUEST", undefined, undefined, { status: 404 } as AxiosResponse)
    );

    await appendToAzure();

    expect(requestPut).toHaveBeenCalledWith(
      expect.any(String),
      { properties: { TTL: 60, TXTRecords: [{ value: [OUR_VALUE.replaceAll('"', "")] }] } },
      expect.objectContaining({ headers: expect.objectContaining({ "If-None-Match": "*" }) as object })
    );
  });

  test("Cloudflare writes nothing when our value is already there, and adds it when it isn't", async () => {
    cloudflareExistingRecords.mockResolvedValueOnce([{ content: OUR_VALUE.replaceAll('"', "") }]);
    await upsertThrough(AcmeDnsProvider.Cloudflare);
    expect(cloudflareInsert).not.toHaveBeenCalled();

    cloudflareExistingRecords.mockResolvedValueOnce([{ content: OTHER_VALUE }]);
    await upsertThrough(AcmeDnsProvider.Cloudflare);
    expect(cloudflareInsert).toHaveBeenCalledTimes(1);
  });

  test("DNS Made Easy writes nothing when our value is already there, and adds it when it isn't", async () => {
    dnsMadeEasyExistingRecords.mockResolvedValueOnce([{ value: OUR_VALUE }]);
    await upsertThrough(AcmeDnsProvider.DNSMadeEasy);
    expect(dnsMadeEasyInsert).not.toHaveBeenCalled();

    dnsMadeEasyExistingRecords.mockResolvedValueOnce([{ value: OTHER_VALUE }]);
    await upsertThrough(AcmeDnsProvider.DNSMadeEasy);
    expect(dnsMadeEasyInsert).toHaveBeenCalledWith(expect.anything(), "zone-1", "_validation-persist", OUR_VALUE);
  });

  test("Azure DNS replaces the record set only if nobody changed it since it was read", async () => {
    requestGet.mockResolvedValueOnce({
      data: { etag: "etag-1", properties: { TTL: 300, TXTRecords: [{ value: [OTHER_VALUE.replaceAll('"', "")] }] } }
    });

    await appendToAzure();

    expect(requestPut).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({ headers: expect.objectContaining({ "If-Match": "etag-1" }) as object })
    );
  });

  test("RFC 2136 refuses a zone name with a single label", async () => {
    await expect(
      DNS_TXT_RECORD_PROVIDERS[AcmeDnsProvider.Rfc2136].getZone(
        {} as TAppConnection,
        "com",
        {} as TDnsTxtRecordProviderDeps
      )
    ).rejects.toThrow("at least two labels");
    await expect(
      DNS_TXT_RECORD_PROVIDERS[AcmeDnsProvider.Rfc2136].getZone(
        {} as TAppConnection,
        "Example.COM.",
        {} as TDnsTxtRecordProviderDeps
      )
    ).resolves.toEqual({ id: "example.com", name: "example.com" });
  });

  test("Azure DNS writes nothing when our value is already there", async () => {
    requestGet.mockResolvedValueOnce({
      data: { properties: { TXTRecords: [{ value: [OUR_VALUE.replaceAll('"', "")] }] } }
    });

    await appendToAzure();

    expect(requestPut).not.toHaveBeenCalled();
  });
});
