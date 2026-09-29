import { STSServiceException } from "@aws-sdk/client-sts";
import { describe, expect, test, vi } from "vitest";

import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";

import { buildSessionLogStorage } from "./agent-vault-session-log-storage-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: vi.fn(async (raw: unknown) => raw)
}));
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn()
}));

describe("buildSessionLogStorage", () => {
  const config = { appConnectionId: "conn-1", bucket: "logs", region: AWSRegion.US_EAST_1, keyPrefix: null };
  const deps = {
    appConnectionDAL: {
      findById: vi.fn(async () => ({ id: "conn-1", name: "prod-logs", orgId: "org-1", app: AppConnection.AWS }))
    },
    kmsService: {}
  } as unknown as Parameters<typeof buildSessionLogStorage>[2];

  test("says which connection could not be used and what AWS said", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(
      new STSServiceException({
        name: "AccessDenied",
        $fault: "client",
        $metadata: { httpStatusCode: 403 },
        message: "User is not authorized to perform: sts:AssumeRole"
      })
    );
    await expect(buildSessionLogStorage(config, "org-1", deps)).rejects.toMatchObject({
      name: "BadRequest",
      message:
        "Couldn't use the AWS connection 'prod-logs' for session logs: User is not authorized to perform: sts:AssumeRole"
    });
  });

  test("keeps anything that is not from AWS out of the message", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(new Error("kms_keys row missing"));
    await expect(buildSessionLogStorage(config, "org-1", deps)).rejects.toMatchObject({
      message: "Couldn't use the AWS connection 'prod-logs' for session logs: Infisical could not load its credentials"
    });
  });

  test.each([
    { why: "no longer exists", row: undefined },
    {
      why: "belongs to another organization",
      row: { id: "conn-1", name: "theirs", orgId: "org-2", app: AppConnection.AWS }
    }
  ])("treats a connection that $why as missing", async ({ row }) => {
    vi.mocked(getAwsConnectionConfig).mockClear();
    vi.mocked(deps.appConnectionDAL.findById).mockResolvedValueOnce(row as never);
    await expect(buildSessionLogStorage(config, "org-1", deps)).rejects.toMatchObject({
      name: "BadRequest",
      message: "The AWS connection used for session logs no longer exists. Choose another on the Settings page."
    });
    expect(getAwsConnectionConfig).not.toHaveBeenCalled();
  });

  test("refuses a connection that is not AWS", async () => {
    vi.mocked(getAwsConnectionConfig).mockClear();
    vi.mocked(deps.appConnectionDAL.findById).mockResolvedValueOnce({
      id: "conn-1",
      name: "github",
      orgId: "org-1",
      app: AppConnection.GitHub
    } as never);
    await expect(buildSessionLogStorage(config, "org-1", deps)).rejects.toMatchObject({
      name: "BadRequest",
      message: `The connection used for session logs is a ${AppConnection.GitHub} connection. Session logs require an AWS connection`
    });
    expect(getAwsConnectionConfig).not.toHaveBeenCalled();
  });
});
