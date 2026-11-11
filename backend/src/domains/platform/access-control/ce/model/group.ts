import { TGroups } from "@app/db/schemas";

export type TGroupProps = TGroups;

// A set of users and identities in one org. A membership held by the group applies to each of its members.
export class Group {
  private constructor(private readonly props: TGroupProps) {}

  static restore(props: TGroupProps): Group {
    return new Group(props);
  }

  get id(): string {
    return this.props.id;
  }

  get orgId(): string {
    return this.props.orgId;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  toJSON(): TGroupProps {
    return { ...this.props };
  }
}
