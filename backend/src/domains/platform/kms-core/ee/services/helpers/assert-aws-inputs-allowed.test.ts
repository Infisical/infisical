import { RuleViolationError } from "@app/domains/lib/errors";
import { KmsAwsCredentialType, TExternalKmsAwsSchema } from "@app/ee/services/external-kms/providers/model";

import { InMemoryKmsCoreStores } from "../../../ce/testing/in-memory-kms-core-stores";
import { AwsProviderInputs, ExternalKmsProviderInputsVersion } from "../../models/aws-provider-inputs";
import { assertAwsInputsAllowed } from "./assert-aws-inputs-allowed";

const { Legacy, OrgBoundExternalId } = ExternalKmsProviderInputsVersion;

const ORG_ID = "8a3c2f0e-6f4b-4b0e-9a57-3f1d2c4b5a60";
const FOREIGN_ORG_ID = "99999999-8888-4777-8666-555555555555";
const FOREIGN_PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const PENDING_FOREIGN_PROJECT_ID = "22222222-3333-4444-8555-666666666666";
const OWN_PROJECT_ID = "33333333-4444-4555-8666-777777777777";

const legacyInputs = (externalId: string, version: number = Legacy) =>
  AwsProviderInputs.restore({
    orgId: ORG_ID,
    version,
    inputs: {
      credential: {
        type: KmsAwsCredentialType.AssumeRole,
        data: { assumeRoleArn: "arn:aws:iam::123456789012:role/kms", externalId }
      },
      awsRegion: "us-east-1",
      kmsKeyId: "key-1"
    } satisfies TExternalKmsAwsSchema
  });

const setup = () => {
  const memory = new InMemoryKmsCoreStores();
  memory.platformRows.addOrg(ORG_ID);
  memory.platformRows.addOrg(FOREIGN_ORG_ID);
  memory.platformRows.addProject(FOREIGN_PROJECT_ID, FOREIGN_ORG_ID);
  memory.platformRows.addProject(PENDING_FOREIGN_PROJECT_ID, FOREIGN_ORG_ID, { deleteAfter: new Date() });
  memory.platformRows.addProject(OWN_PROJECT_ID, ORG_ID);
  const isOrganization = vi.spyOn(memory.stores.organizationKeyStore, "isOrganization");
  const findProjectOrg = vi.spyOn(memory.stores.projectKeyStore, "findOrgIdIncludingPendingDeletion");
  return { stores: memory.stores, isOrganization, findProjectOrg };
};

describe("assertAwsInputsAllowed", () => {
  test.each([
    ["another organization's ID", FOREIGN_ORG_ID],
    ["another organization's project ID", FOREIGN_PROJECT_ID],
    ["a project ID of another organization pending deletion", PENDING_FOREIGN_PROJECT_ID]
  ])("should refuse a legacy external ID that is %s", async (_, externalId) => {
    // Setup
    const { stores } = setup();

    // Action
    const result = assertAwsInputsAllowed(legacyInputs(externalId), stores);

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
  });

  test.each([
    ["one of the organization's own project IDs", OWN_PROJECT_ID],
    ["a value no organization owns", "customer-chosen"]
  ])("should allow a legacy external ID that is %s", async (_, externalId) => {
    // Setup
    const { stores } = setup();

    // Action
    const result = assertAwsInputsAllowed(legacyInputs(externalId), stores);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  test("should look a value that is not a UUID up only as a project", async () => {
    // Setup
    const { stores, isOrganization, findProjectOrg } = setup();

    // Action
    await assertAwsInputsAllowed(legacyInputs("customer-chosen"), stores);

    // Assert
    expect(isOrganization).not.toHaveBeenCalled();
    expect(findProjectOrg).toHaveBeenCalledWith("customer-chosen");
  });

  test("should look nothing up for current inputs", async () => {
    // Setup
    const { stores, isOrganization, findProjectOrg } = setup();

    // Action
    await assertAwsInputsAllowed(legacyInputs(ORG_ID, OrgBoundExternalId), stores);

    // Assert
    expect(isOrganization).not.toHaveBeenCalled();
    expect(findProjectOrg).not.toHaveBeenCalled();
  });
});
