import { RuleViolationError } from "@app/domains/lib/errors";
import { KmsAwsCredentialType, TExternalKmsAwsSchema } from "@app/ee/services/external-kms/providers/model";
import { deterministicStringify } from "@app/lib/fn/object";
import { isUuidV4 } from "@app/lib/validator";

export enum ExternalKmsProviderInputsVersion {
  // AWS assume-role external IDs were taken as given; they are still sent as stored unless they name
  // another organization or one of its projects.
  Legacy = 1,
  // AWS assume-role external IDs must be the organization ID.
  OrgBoundExternalId = 2
}

export type TAwsProviderInputsRecord = {
  orgId: string;
  inputs: TExternalKmsAwsSchema;
  version: number;
};

const PROJECT_ID_MAX_LENGTH = 36;

const isOrgId = (externalId: string, orgId: string) => externalId.toLowerCase() === orgId.toLowerCase();

const bindToOrg = (inputs: TExternalKmsAwsSchema, orgId: string): TExternalKmsAwsSchema => {
  if (inputs.credential.type !== KmsAwsCredentialType.AssumeRole) return inputs;

  const { externalId } = inputs.credential.data;
  if (!externalId || isOrgId(externalId, orgId)) {
    return {
      ...inputs,
      credential: { ...inputs.credential, data: { ...inputs.credential.data, externalId: orgId } }
    };
  }

  throw new RuleViolationError({
    message: `The AWS external ID must be your organization ID (${orgId}). Set the sts:ExternalId condition in the IAM role's trust policy to your organization ID and use the same value here.`
  });
};

// An AWS external KMS's inputs under the external ID rules of the version they were saved with. The external ID
// is the organization ID, or a role could be pointed at another organization's trust policy.
export class AwsProviderInputs {
  private constructor(
    private readonly orgId: string,
    private readonly providerInputs: TExternalKmsAwsSchema,
    private readonly providerInputsVersion: number
  ) {}

  static create(record: Omit<TAwsProviderInputsRecord, "version">): AwsProviderInputs {
    return new AwsProviderInputs(
      record.orgId,
      bindToOrg(record.inputs, record.orgId),
      ExternalKmsProviderInputsVersion.OrgBoundExternalId
    );
  }

  static restore(record: TAwsProviderInputsRecord): AwsProviderInputs {
    return new AwsProviderInputs(record.orgId, record.inputs, record.version);
  }

  get inputs(): TExternalKmsAwsSchema {
    return this.providerInputs;
  }

  get version(): number {
    return this.providerInputsVersion;
  }

  // A legacy row keeps its stored external ID only while its credential is unchanged. Any change, such as a
  // new role ARN, moves it to the current rules.
  withChanges(updated: TExternalKmsAwsSchema): AwsProviderInputs {
    if (
      this.isLegacy() &&
      deterministicStringify(this.providerInputs.credential) === deterministicStringify(updated.credential)
    ) {
      return new AwsProviderInputs(this.orgId, updated, ExternalKmsProviderInputsVersion.Legacy);
    }
    return AwsProviderInputs.create({ orgId: this.orgId, inputs: updated });
  }

  // What AssumeRole is sent. Current inputs are bound again, so a stored ID that is not the org ID is refused.
  toProviderInputs(): TExternalKmsAwsSchema {
    return this.isLegacy() ? this.providerInputs : bindToOrg(this.providerInputs, this.orgId);
  }

  hasLegacyExternalId(): boolean {
    if (!this.isLegacy() || this.providerInputs.credential.type !== KmsAwsCredentialType.AssumeRole) return false;

    const { externalId } = this.providerInputs.credential.data;
    return !externalId || !isOrgId(externalId, this.orgId);
  }

  // The legacy external ID to look up before it is sent, or null when no other organization could own it.
  // Projects carried over from MongoDB kept 24-character IDs, so every value that fits projects.id is looked
  // up as a project. Only a UUID can name an organization.
  legacyExternalIdToCheck(): { externalId: string; mayBeOrganization: boolean } | null {
    if (!this.isLegacy() || this.providerInputs.credential.type !== KmsAwsCredentialType.AssumeRole) return null;

    const { externalId } = this.providerInputs.credential.data;
    if (!externalId || isOrgId(externalId, this.orgId) || externalId.length > PROJECT_ID_MAX_LENGTH) return null;
    return { externalId, mayBeOrganization: isUuidV4(externalId) };
  }

  // A legacy external ID that names another organization or one of its projects is refused: no customer sets
  // that up for themselves, and it is what a cross-organization takeover stores. A project pending deletion
  // still counts because its role can still trust its ID.
  assertNotForeign(isOrganization: boolean, projectOrgId: string | null): void {
    if (!isOrganization && (!projectOrgId || projectOrgId === this.orgId)) return;

    throw new RuleViolationError({
      message: `This AWS external KMS sends an external ID that belongs to another Infisical organization or one of its projects. Update its credentials to use your organization ID (${this.orgId}), and require the same value in the IAM role's trust policy.`
    });
  }

  toJSON(): TAwsProviderInputsRecord {
    return { orgId: this.orgId, inputs: this.providerInputs, version: this.providerInputsVersion };
  }

  private isLegacy() {
    return this.providerInputsVersion === ExternalKmsProviderInputsVersion.Legacy;
  }
}
