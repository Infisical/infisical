import { TRoles } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

export type TRoleProps = TRoles;

// A custom role: packed rules defined by an org or a project. Built-in roles are not stored; their owners pass
// them to Access Control.
export class Role {
  private constructor(private readonly props: TRoleProps) {}

  static restore(props: TRoleProps): Role {
    if (Boolean(props.orgId) === Boolean(props.projectId)) {
      throw new BadRequestError({ message: "A custom role must belong to exactly one organization or project" });
    }
    return new Role(props);
  }

  get id(): string {
    return this.props.id;
  }

  get slug(): string {
    return this.props.slug;
  }

  get name(): string {
    return this.props.name;
  }

  get permissions(): unknown {
    return this.props.permissions;
  }

  toJSON(): TRoleProps {
    return { ...this.props };
  }
}
