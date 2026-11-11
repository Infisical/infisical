import { TAdditionalPrivileges } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

export type TPrivilegeProps = TAdditionalPrivileges;

// Permissions granted to one user or identity on top of their roles, org-wide or project-wide. A folder grant is a
// privilege on one secret folder, holding a folder role instead of rules.
export class Privilege {
  private constructor(private readonly props: TPrivilegeProps) {}

  static restore(props: TPrivilegeProps): Privilege {
    if (Boolean(props.actorUserId) === Boolean(props.actorIdentityId)) {
      throw new BadRequestError({ message: "A privilege must belong to exactly one user or identity" });
    }
    if (props.folderId && (!props.role || !props.projectId)) {
      throw new BadRequestError({ message: "A folder grant must name its folder role and project" });
    }
    return new Privilege({ ...props, isTemporary: Boolean(props.isTemporary) });
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get permissions(): unknown {
    return this.props.permissions;
  }

  get isTemporary(): boolean {
    return Boolean(this.props.isTemporary);
  }

  get temporaryAccessStartTime(): Date | null {
    return this.props.temporaryAccessStartTime ?? null;
  }

  get temporaryAccessEndTime(): Date | null {
    return this.props.temporaryAccessEndTime ?? null;
  }

  get role(): string | null {
    return this.props.role ?? null;
  }

  get folderId(): string | null {
    return this.props.folderId ?? null;
  }

  get isFolderGrant(): boolean {
    return Boolean(this.props.folderId);
  }

  isActive(now: Date = new Date()): boolean {
    if (!this.props.isTemporary) return true;
    return Boolean(this.props.temporaryAccessEndTime && now < this.props.temporaryAccessEndTime);
  }

  toJSON(): TPrivilegeProps {
    return { ...this.props };
  }
}
