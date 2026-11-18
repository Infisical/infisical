import { ProjectType, TProjects } from "@app/db/schemas";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";

export type TProjectRecord = Pick<
  TProjects,
  "id" | "name" | "slug" | "orgId" | "type" | "enforceEncryptedSecretManagerSecretMetadata"
>;

// The project facts a permission check needs.
export class Project {
  private constructor(private readonly record: TProjectRecord) {}

  static restore(record: TProjectRecord): Project {
    return new Project({ ...record });
  }

  get id(): string {
    return this.record.id;
  }

  get name(): string {
    return this.record.name;
  }

  get slug(): string {
    return this.record.slug;
  }

  get orgId(): string {
    return this.record.orgId;
  }

  get type(): ProjectType {
    return this.record.type as ProjectType;
  }

  get enforcesEncryptedSecretMetadata(): boolean {
    return Boolean(this.record.enforceEncryptedSecretManagerSecretMetadata);
  }

  // Refuses a project of another org, and one of another product than the check is for (omit type for checks every
  // project type shares).
  assertUsableBy({ orgId, type }: { orgId: string; type?: ProjectType }): void {
    if (this.record.orgId !== orgId) {
      throw new PermissionDeniedError({ message: "This project does not belong to your selected organization." });
    }
    if (type && type !== this.record.type) {
      throw new RuleViolationError({
        message: `The project is of type ${this.record.type}. Operations of type ${type} are not allowed.`
      });
    }
  }

  toJSON(): TProjectRecord {
    return { ...this.record };
  }
}
