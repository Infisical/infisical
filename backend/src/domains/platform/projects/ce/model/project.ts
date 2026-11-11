import { ProjectType, TProjects } from "@app/db/schemas";

export type TProjectProps = Pick<
  TProjects,
  "id" | "name" | "slug" | "orgId" | "type" | "enforceEncryptedSecretManagerSecretMetadata"
>;

// The project facts a permission check needs.
export class Project {
  private constructor(private readonly props: TProjectProps) {}

  static restore(props: TProjectProps): Project {
    return new Project(props);
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): string {
    return this.props.slug;
  }

  get orgId(): string {
    return this.props.orgId;
  }

  get type(): ProjectType {
    return this.props.type as ProjectType;
  }

  get enforcesEncryptedSecretMetadata(): boolean {
    return Boolean(this.props.enforceEncryptedSecretManagerSecretMetadata);
  }

  toJSON(): TProjectProps {
    return { ...this.props };
  }
}
