import { TRoles } from "@app/db/schemas";

import { Grant } from "./grant";

export type TRoleRecord = TRoles;

// A custom role: packed rules an org or a project defined. Built-in roles are not stored; their owners define them.
export class Role {
  private constructor(private readonly record: TRoleRecord) {}

  static restore(record: TRoleRecord): Role {
    return new Role({ ...record });
  }

  get id(): string {
    return this.record.id;
  }

  get slug(): string {
    return this.record.slug;
  }

  get name(): string {
    return this.record.name;
  }

  // What holding this role grants, read the way a held custom role is.
  toGrant(): Grant {
    return Grant.restore({ slug: "custom", packedRules: this.record.permissions });
  }

  toJSON(): TRoleRecord {
    return { ...this.record };
  }
}
