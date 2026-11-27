import { TRoles } from "@app/db/schemas";

import { Grant } from "./grant";

export type TRoleRecord = TRoles;

// Custom roles only. Built-in roles aren't stored; their scope owners define them in code.
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

  toGrant(): Grant {
    return Grant.custom(this.record.permissions);
  }

  toJSON(): TRoleRecord {
    return { ...this.record };
  }
}
