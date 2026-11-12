import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { AwsConnectionMethod } from "@app/services/app-connection/aws/aws-connection-enums";

import { ProvisioningTemplateKind } from "../provisioning-template-types";
import { AWS_PROVISIONING_TEMPLATE_VERSION } from "./aws-provisioning-template-constants";
import {
  AWS_USE_CASE_COMPANION_PARAMETERS,
  AWS_USE_CASE_KMS_PARAMETERS,
  AWS_USE_CASE_OPTIONAL_COMPANION_PARAMETERS,
  awsProvisioningTemplateProvider
} from "./aws-provisioning-template-fns";

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

const update = (
  configuration: unknown,
  useCases: string[],
  region?: string,
  method: string = AwsConnectionMethod.AssumeRole
) => awsProvisioningTemplateProvider.getUpdateTemplate({ configuration, method }, { useCases, region });

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
      updateUrl: `https://eu-west-1.console.aws.amazon.com/cloudformation/home?region=eu-west-1#/stacks/update?stackId=infisical-aws-app-connection&templateURL=${encodeURIComponent(
        `https://mirror.test/cfn/aws-app-connection/v${AWS_PROVISIONING_TEMPLATE_VERSION}/infisical-aws-app-connection.yaml`
      )}`,
      templateUrl: `https://mirror.test/cfn/aws-app-connection/v${AWS_PROVISIONING_TEMPLATE_VERSION}/infisical-aws-app-connection.yaml`,
      templateVersion: AWS_PROVISIONING_TEMPLATE_VERSION,
      parameterChanges: [],
      companionParameters: [],
      optionalParameters: ["EnableSecretsManagerKms"]
    });
  });

  it("opens the update wizard by stack name and prefills only the template, never parameters", async () => {
    const template = await update(provisioning(), ["secrets-manager", "parameter-store"]);

    const updateUrl = template?.kind === ProvisioningTemplateKind.CloudFormationUpdate ? template.updateUrl : "";

    expect(updateUrl).toContain("#/stacks/update?stackId=infisical-aws-app-connection&templateURL=");
    expect(updateUrl).not.toContain("param_");
  });

  it("turns added use cases on and lists nothing for unchanged ones", async () => {
    const template = await update(provisioning(), ["secrets-manager", "parameter-store"]);

    expect(template).toMatchObject({
      parameterChanges: [{ useCase: "parameter-store", parameter: "EnableParameterStore", value: "true" }],
      companionParameters: []
    });
  });

  it("turns removed use cases off", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "acm-sync"] }), ["secrets-manager"]);

    expect(template).toMatchObject({
      parameterChanges: [{ useCase: "acm-sync", parameter: "EnableAcmSync", value: "false" }]
    });
  });

  it("handles additions and removals together", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "acm-sync"] }), [
      "secrets-manager",
      "iam-rotation"
    ]);

    expect(template).toMatchObject({
      parameterChanges: [
        { useCase: "iam-rotation", parameter: "EnableIamRotation", value: "true" },
        { useCase: "acm-sync", parameter: "EnableAcmSync", value: "false" }
      ]
    });
  });

  it("names the extra parameters a newly enabled use case needs", async () => {
    const template = await update(provisioning(), [
      "secrets-manager",
      "agent-vault-session-logs",
      "pam-recording",
      "private-ca"
    ]);

    expect(template).toMatchObject({
      companionParameters: ["AgentVaultSessionLogsBucket", "PamRecordingBucket", "PrivateCaArn"],
      optionalParameters: ["EnableSecretsManagerKms", "AgentVaultSessionLogsKeyPrefix"]
    });
  });

  it("names the KMS toggle of every kept use case that has one, including recorded ones", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "acm-sync"] }), [
      "secrets-manager",
      "parameter-store"
    ]);

    expect(template).toMatchObject({
      optionalParameters: ["EnableSecretsManagerKms", "EnableParameterStoreKms"]
    });
  });

  it("does not name a KMS toggle for a removed use case", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "parameter-store"] }), [
      "parameter-store"
    ]);

    expect(template).toMatchObject({ optionalParameters: ["EnableParameterStoreKms"] });
  });

  it("does not name the session logs key prefix again once that use case is recorded", async () => {
    const template = await update(provisioning({ useCases: ["agent-vault-session-logs"] }), [
      "agent-vault-session-logs",
      "pam-recording"
    ]);

    expect(template).toMatchObject({ companionParameters: ["PamRecordingBucket"], optionalParameters: [] });
  });

  it("does not ask again for a parameter an already enabled use case filled in", async () => {
    const template = await update(provisioning({ useCases: ["acm-public-ca"] }), ["acm-public-ca", "acme-route53"]);

    expect(template).toMatchObject({
      parameterChanges: [{ useCase: "acme-route53", parameter: "EnableAcmeRoute53", value: "true" }],
      companionParameters: []
    });
  });

  it("names a shared parameter once when two use cases that need it are added", async () => {
    const template = await update(provisioning(), ["secrets-manager", "acm-public-ca", "acme-route53"]);

    expect(template).toMatchObject({ companionParameters: ["Route53HostedZoneId"] });
  });

  it("does not ask for extra parameters when a use case is removed", async () => {
    const template = await update(provisioning({ useCases: ["secrets-manager", "pam-recording"] }), [
      "secrets-manager"
    ]);

    expect(template).toMatchObject({
      parameterChanges: [{ useCase: "pam-recording", parameter: "EnablePamRecording", value: "false" }],
      companionParameters: []
    });
  });

  it("returns null when the role was created manually or has no recorded provisioning", async () => {
    expect(await update({ provisioning: null }, ["secrets-manager"])).toBeNull();
    expect(await update({}, ["secrets-manager"])).toBeNull();
    expect(await update(undefined, ["secrets-manager"])).toBeNull();
  });

  it("returns null for an Access Key connection even when provisioning is recorded", async () => {
    const template = await update(provisioning(), ["secrets-manager"], undefined, AwsConnectionMethod.AccessKey);

    expect(template).toBeNull();
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
    [
      ...Object.values(AWS_USE_CASE_COMPANION_PARAMETERS).flat(),
      ...Object.values(AWS_USE_CASE_OPTIONAL_COMPANION_PARAMETERS).flat(),
      ...Object.values(AWS_USE_CASE_KMS_PARAMETERS)
    ].forEach((parameter) => {
      expect(template).toContain(`\n  ${parameter}:`);
    });
  });
});
