import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";

import { route53DeleteRecord, route53GetHostedZone, route53UpsertRecord } from "./route53";

const sendMock = vi.fn().mockResolvedValue({});

vi.mock("@app/lib/crypto/cryptography", () => ({
  crypto: { isFipsModeEnabled: () => false }
}));

vi.mock("@aws-sdk/client-route-53", () => ({
  Route53Client: vi.fn().mockImplementation(() => ({
    send: sendMock
  })),
  ChangeResourceRecordSetsCommand: vi.fn(),
  GetHostedZoneCommand: vi.fn()
}));

vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn().mockResolvedValue({
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    region: "us-east-1"
  })
}));

describe("Route 53 DNS Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const connection = {
    orgId: "org-1",
    projectId: "proj-1"
  } as TAwsConnectionConfig;

  it("builds Route53 client with ProjectType.CertificateManager by default", async () => {
    await route53UpsertRecord(connection, "zone-1", {
      name: "_acme-challenge.example.com",
      type: "TXT",
      value: "token"
    });

    expect(getAwsConnectionConfig).toHaveBeenCalledWith(
      { ...connection, projectType: ProjectType.CertificateManager },
      AWSRegion.US_EAST_1
    );
  });

  it("preserves explicit projectType if present on connection", async () => {
    const customConnection = {
      ...connection,
      projectType: "custom-type"
    } as TAwsConnectionConfig;

    await route53DeleteRecord(customConnection, "zone-1", {
      name: "_acme-challenge.example.com",
      type: "TXT",
      value: "token"
    });

    expect(getAwsConnectionConfig).toHaveBeenCalledWith(
      { ...connection, projectType: "custom-type" },
      AWSRegion.US_EAST_1
    );
  });

  it("uses ProjectType.CertificateManager when getting hosted zone", async () => {
    await route53GetHostedZone(connection, "zone-1");

    expect(getAwsConnectionConfig).toHaveBeenCalledWith(
      { ...connection, projectType: ProjectType.CertificateManager },
      AWSRegion.US_EAST_1
    );
  });
});
