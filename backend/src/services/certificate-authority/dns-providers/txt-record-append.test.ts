import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TAzureDnsConnection } from "@app/services/app-connection/azure-dns/azure-dns-connection-types";

import { azureDnsAppendTxtRecord } from "../acme/dns-providers/azure-dns";
import { route53AppendTxtRecord } from "./route53";

const { route53Send, requestGet, requestPut } = vi.hoisted(() => ({
  route53Send: vi.fn(),
  requestGet: vi.fn(),
  requestPut: vi.fn()
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
vi.mock("@app/lib/config/request", () => ({ request: { get: requestGet, put: requestPut } }));
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

  test("Azure DNS writes nothing when our value is already there", async () => {
    requestGet.mockResolvedValueOnce({
      data: { properties: { TXTRecords: [{ value: [OUR_VALUE.replaceAll('"', "")] }] } }
    });

    await appendToAzure();

    expect(requestPut).not.toHaveBeenCalled();
  });
});
