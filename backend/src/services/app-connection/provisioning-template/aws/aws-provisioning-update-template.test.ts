import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { AWS_PROVISIONING_TEMPLATE_VERSION } from "./aws-provisioning-template-constants";
import { awsProvisioningTemplateProvider, AWS_USE_CASE_COMPANION_PARAMETERS } from "./aws-provisioning-template-fns";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_AWS_TEMPLATE_BASE_URL: "https://mirror.test/cfn" })
}));

const provisioning = (overrides: Record<string, unknown> = {}) => ({
  provisioning: {
    launchMethod: "launch-stack",
    useCases: ["secrets-manager"],
    stackName: "infisical-aws-app-connection",
    partition: "aws",
    templateVersion: "1",
    region: "eu-west-1",
    roleName: "infisical-app-connection",
    ...overrides
  }
});

const update = (configuration: unknown, useCases: string[], region?: string) =>
  awsProvisioningTemplateProvider.getUpdateTemplate({ configuration }, { useCases, region });

describe("awsProvisioningTemplateProvider.getUpdateTemplate", () => {
  it("describes the stack and the current template", async () => {
    const template = await update(provisioning(), ["secrets-manager"]);

    expect(template).toEqual({
      kind: "cloudformation-update",
      stackName: "infisical-aws-app-connection",
      region: "eu-west-1",
      partition: "aws",
      stackUrl:
        "https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks?filteringText=infisical-aws-app-connection",
      templateUrl: `https://mirror.test/cfn/aws-app-connection/v${AWS_PROVISIONING_TEMPLATE_VERSION}/infisical-aws-app-connection.yaml`,
      templateVersion: AWS_PROVISIONING_TEMPLATE_VERSION,
      parameters: {},
      companionParameters: []
    });
  });

  it("turns added use cases on and lists nothing for unchanged ones", async () => {
    const template = await update(provisioning(), ["secrets-manager", "parameter-store"]);

    expect(template).toMatchObject({ parameters: { EnableParameterStore: "true" }, companionParameters: [] });
  });

  it("turns removed use cases off", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "acm-sync"] }), ["secrets-manager"]);

    expect(template).toMatchObject({ parameters: { EnableAcmSync: "false" } });
  });

  it("handles additions and removals together", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "acm-sync"] }), [
      "secrets-manager",
      "iam-rotation"
    ]);

    expect(template).toMatchObject({ parameters: { EnableIamRotation: "true", EnableAcmSync: "false" } });
  });

  it("names the extra parameters a newly enabled use case needs", async () => {
    const template = await update(provisioning(), [
      "secrets-manager",
      "agent-vault-session-logs",
      "pam-recording",
      "private-ca"
    ]);

    expect(template).toMatchObject({
      companionParameters: [
        "AgentVaultSessionLogsBucket",
        "AgentVaultSessionLogsKeyPrefix",
        "PamRecordingBucket",
        "PrivateCaArn"
      ]
    });
  });

  it("does not ask again for a parameter an already enabled use case filled in", async () => {
    const template = await update(provisioning({ useCases: ["acm-public-ca"] }), ["acm-public-ca", "acme-route53"]);

    expect(template).toMatchObject({ parameters: { EnableAcmeRoute53: "true" }, companionParameters: [] });
  });

  it("names a shared parameter once when two use cases that need it are added", async () => {
    const template = await update(provisioning(), ["secrets-manager", "acm-public-ca", "acme-route53"]);

    expect(template).toMatchObject({ companionParameters: ["Route53HostedZoneId"] });
  });

  it("does not ask for extra parameters when a use case is removed", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "pam-recording"] }), [
      "secrets-manager"
    ]);

    expect(template).toMatchObject({ parameters: { EnablePamRecording: "false" }, companionParameters: [] });
  });

  it("returns null when the role was created manually or has no recorded provisioning", async () => {
    expect(await update({ provisioning: null }, ["secrets-manager"])).toBeNull();
    expect(await update({}, ["secrets-manager"])).toBeNull();
    expect(await update(undefined, ["secrets-manager"])).toBeNull();
  });

  it("returns null outside the commercial partition", async () => {
    const template = await update(provisioning({ partition: "aws-us-gov", region: "us-gov-west-1" }), [
      "secrets-manager"
    ]);

    expect(template).toBeNull();
  });

  it("uses the supplied region only when the record has none", async () => {
    const withoutRegion = provisioning({ region: undefined });

    expect(await update(withoutRegion, ["secrets-manager"], "us-west-2")).toMatchObject({ region: "us-west-2" });
    expect(await update(provisioning(), ["secrets-manager"], "us-west-2")).toMatchObject({ region: "eu-west-1" });
  });

  it("asks for a region when neither the record nor the request has one", async () => {
    await expect(update(provisioning({ region: undefined }), ["secrets-manager"])).rejects.toThrow(
      /does not have a recorded stack region/
    );
  });

  it("rejects a region outside the recorded partition", async () => {
    await expect(
      update(provisioning({ region: undefined }), ["secrets-manager"], "us-gov-west-1")
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("AWS_USE_CASE_COMPANION_PARAMETERS", () => {
  const template = readFileSync(
    path.resolve(__dirname, "../../../../../../cloudformation/aws-app-connection/infisical-aws-app-connection.yaml"),
    "utf8"
  );

  it("names parameters the template defines", () => {
    Object.values(AWS_USE_CASE_COMPANION_PARAMETERS)
      .flat()
      .forEach((parameter) => {
        expect(template).toMatch(new RegExp(`^  ${parameter}:`, "m"));
      });
  });
});
