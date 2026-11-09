import { TSuperAdminUpdate } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

// The columns one update writes. Never empty.
export class InstanceConfigChange {
  private constructor(private readonly columns: TSuperAdminUpdate) {}

  static create(columns: TSuperAdminUpdate): InstanceConfigChange {
    const set = Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));
    if (Object.keys(set).length === 0) {
      throw new BadRequestError({
        message:
          "No recognized instance configuration fields were provided. Settings that have been removed are no longer accepted."
      });
    }
    return new InstanceConfigChange(set as TSuperAdminUpdate);
  }

  touches(column: keyof TSuperAdminUpdate): boolean {
    return column in this.columns;
  }

  toJSON(): TSuperAdminUpdate {
    return { ...this.columns };
  }
}
