import { RuleViolationError } from "@app/domains/lib/errors";
import { KmsAwsCredentialType, TExternalKmsAwsSchema } from "@app/ee/services/external-kms/providers/model";

import { AwsProviderInputs, ExternalKmsProviderInputsVersion } from "./aws-provider-inputs";

const { Legacy, OrgBoundExternalId } = ExternalKmsProviderInputsVersion;

const ORG_ID = "8a3c2f0e-6f4b-4b0e-9a57-3f1d2c4b5a60";
const OTHER_UUID = "11111111-2222-4333-8444-555555555555";
const MONGO_PROJECT_ID = "64b7f0c2a1d3e4f5a6b7c8d9";

const assumeRole = (
  externalId?: string,
  assumeRoleArn = "arn:aws:iam::123456789012:role/kms"
): TExternalKmsAwsSchema => ({
  credential: { type: KmsAwsCredentialType.AssumeRole, data: { assumeRoleArn, externalId } },
  awsRegion: "us-east-1",
  kmsKeyId: "key-1"
});

const accessKey = (): TExternalKmsAwsSchema => ({
  credential: { type: KmsAwsCredentialType.AccessKey, data: { accessKey: "AKIA", secretKey: "secret" } },
  awsRegion: "us-east-1",
  kmsKeyId: "key-1"
});

const externalIdOf = (inputs: TExternalKmsAwsSchema) =>
  inputs.credential.type === KmsAwsCredentialType.AssumeRole ? inputs.credential.data.externalId : undefined;

const restore = (inputs: TExternalKmsAwsSchema, version: number) =>
  AwsProviderInputs.restore({ orgId: ORG_ID, inputs, version });

describe("AwsProviderInputs.create", () => {
  test.each([
    ["no external ID", undefined],
    ["the organization ID", ORG_ID],
    ["the organization ID in upper case", ORG_ID.toUpperCase()]
  ])("should store the organization ID when given %s", (_, externalId) => {
    // Setup
    const inputs = assumeRole(externalId);

    // Action
    const created = AwsProviderInputs.create({ orgId: ORG_ID, inputs });

    // Assert
    expect(externalIdOf(created.inputs)).toBe(ORG_ID);
    expect(created.version).toBe(OrgBoundExternalId);
  });

  test("should refuse an external ID that is not the organization ID", () => {
    // Setup
    const inputs = assumeRole(OTHER_UUID);

    // Action
    const create = () => AwsProviderInputs.create({ orgId: ORG_ID, inputs });

    // Assert
    expect(create).toThrow(RuleViolationError);
    expect(create).toThrow(`The AWS external ID must be your organization ID (${ORG_ID})`);
  });

  test("should leave access-key inputs as given", () => {
    // Setup
    const inputs = accessKey();

    // Action
    const created = AwsProviderInputs.create({ orgId: ORG_ID, inputs });

    // Assert
    expect(created.inputs).toEqual(inputs);
  });
});

describe("AwsProviderInputs.withChanges", () => {
  test("should keep a legacy external ID while the credential is unchanged", () => {
    // Setup
    const stored = restore(assumeRole("customer-chosen"), Legacy);

    // Action
    const changed = stored.withChanges({ ...assumeRole("customer-chosen"), awsRegion: "eu-west-1" });

    // Assert
    expect(changed.version).toBe(Legacy);
    expect(changed.toProviderInputs()).toMatchObject({ awsRegion: "eu-west-1" });
    expect(externalIdOf(changed.toProviderInputs())).toBe("customer-chosen");
  });

  test("should move a legacy row to the current rules when its credential changes", () => {
    // Setup
    const stored = restore(assumeRole("customer-chosen"), Legacy);

    // Action
    const changed = stored.withChanges(assumeRole(undefined, "arn:aws:iam::210987654321:role/x"));

    // Assert
    expect(changed.version).toBe(OrgBoundExternalId);
    expect(externalIdOf(changed.inputs)).toBe(ORG_ID);
  });

  test("should refuse a credential change that keeps a legacy external ID", () => {
    // Setup
    const stored = restore(assumeRole("customer-chosen"), Legacy);

    // Action
    const change = () => stored.withChanges(assumeRole("customer-chosen", "arn:aws:iam::210987654321:role/x"));

    // Assert
    expect(change).toThrow(RuleViolationError);
  });

  test("should keep current rows on the current rules", () => {
    // Setup
    const stored = restore(assumeRole(ORG_ID), OrgBoundExternalId);

    // Action
    const changed = stored.withChanges({ ...assumeRole(ORG_ID), awsRegion: "eu-west-1" });

    // Assert
    expect(changed.version).toBe(OrgBoundExternalId);
    expect(externalIdOf(changed.inputs)).toBe(ORG_ID);
  });
});

describe("AwsProviderInputs.toProviderInputs", () => {
  test("should send a legacy row as stored", () => {
    // Setup
    const stored = restore(assumeRole("customer-chosen"), Legacy);

    // Action
    const sent = stored.toProviderInputs();

    // Assert
    expect(sent).toEqual(assumeRole("customer-chosen"));
  });

  test("should send the organization ID for a current row stored without one", () => {
    // Setup
    const stored = restore(assumeRole(), OrgBoundExternalId);

    // Action
    const sent = stored.toProviderInputs();

    // Assert
    expect(externalIdOf(sent)).toBe(ORG_ID);
  });

  test("should refuse a current row holding an external ID that is not the organization ID", () => {
    // Setup
    const stored = restore(assumeRole(OTHER_UUID), OrgBoundExternalId);

    // Action
    const send = () => stored.toProviderInputs();

    // Assert
    expect(send).toThrow(RuleViolationError);
  });
});

describe("AwsProviderInputs.hasLegacyExternalId", () => {
  test.each([
    ["a legacy custom external ID", assumeRole("customer-chosen"), Legacy, true],
    ["a legacy row without an external ID", assumeRole(), Legacy, true],
    ["a legacy row holding the organization ID", assumeRole(ORG_ID.toUpperCase()), Legacy, false],
    ["a legacy access-key row", accessKey(), Legacy, false],
    ["a current row", assumeRole(ORG_ID), OrgBoundExternalId, false]
  ])("should answer for %s", (_, inputs, version, expected) => {
    // Setup
    const stored = restore(inputs, version);

    // Action
    const result = stored.hasLegacyExternalId();

    // Assert
    expect(result).toBe(expected);
  });
});

describe("AwsProviderInputs.legacyExternalIdToCheck", () => {
  test.each([
    ["a UUID", OTHER_UUID, { externalId: OTHER_UUID, mayBeOrganization: true }],
    ["a MongoDB project ID", MONGO_PROJECT_ID, { externalId: MONGO_PROJECT_ID, mayBeOrganization: false }],
    ["a free-form value", "customer-chosen", { externalId: "customer-chosen", mayBeOrganization: false }]
  ])("should look up a legacy external ID that is %s", (_, externalId, expected) => {
    // Setup
    const stored = restore(assumeRole(externalId), Legacy);

    // Action
    const toCheck = stored.legacyExternalIdToCheck();

    // Assert
    expect(toCheck).toEqual(expected);
  });

  test.each([
    ["a current row", assumeRole(OTHER_UUID), OrgBoundExternalId],
    ["an access-key row", accessKey(), Legacy],
    ["a row without an external ID", assumeRole(), Legacy],
    ["the organization ID in upper case", assumeRole(ORG_ID.toUpperCase()), Legacy],
    ["a value longer than a project ID", assumeRole("x".repeat(37)), Legacy]
  ])("should look nothing up for %s", (_, inputs, version) => {
    // Setup
    const stored = restore(inputs, version);

    // Action
    const toCheck = stored.legacyExternalIdToCheck();

    // Assert
    expect(toCheck).toBeNull();
  });
});

describe("AwsProviderInputs.assertNotForeign", () => {
  test.each([
    ["another organization", true, null],
    ["another organization's project", false, OTHER_UUID]
  ])("should refuse an external ID naming %s", (_, isOrganization, projectOrgId) => {
    // Setup
    const stored = restore(assumeRole(OTHER_UUID), Legacy);

    // Action
    const assert = () => stored.assertNotForeign(isOrganization, projectOrgId);

    // Assert
    expect(assert).toThrow(RuleViolationError);
    expect(assert).toThrow(`Update its credentials to use your organization ID (${ORG_ID})`);
  });

  test.each([
    ["nothing in Infisical", null],
    ["one of the organization's own projects", ORG_ID]
  ])("should allow an external ID naming %s", (_, projectOrgId) => {
    // Setup
    const stored = restore(assumeRole(OTHER_UUID), Legacy);

    // Action
    const assert = () => stored.assertNotForeign(false, projectOrgId);

    // Assert
    expect(assert).not.toThrow();
  });
});
