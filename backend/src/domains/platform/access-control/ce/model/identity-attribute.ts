import { TIdentityMetadata } from "@app/db/schemas";

export type TIdentityAttributeProps = Pick<TIdentityMetadata, "id" | "key" | "value">;

// A key and value attached to a user (per org) or an identity, read by `{{identity.metadata.<key>}}` conditions.
export class IdentityAttribute {
  private constructor(private readonly props: TIdentityAttributeProps) {}

  static restore(props: TIdentityAttributeProps): IdentityAttribute {
    return new IdentityAttribute(props);
  }

  get key(): string {
    return this.props.key;
  }

  get value(): string {
    return this.props.value;
  }

  toJSON(): TIdentityAttributeProps {
    return { ...this.props };
  }
}
