export enum ScopeKind {
  Organization = "organization",
  Project = "project"
}

export type TScopeKeyProps = {
  kind: ScopeKind;
  scopeId: string;
  orgId: string;
  // The KMS key that encrypts the data key: organizations.kmsDefaultKeyId or projects.kmsSecretManagerKeyId.
  kmsKeyId: string | null;
  // organizations.kmsEncryptedDataKey or projects.kmsSecretManagerEncryptedDataKey.
  encryptedDataKey: Buffer | null;
  // projects.kmsCertificateKeyId. Always null for an org.
  certificateKmsKeyId: string | null;
};

// The key columns an org or project carries. KMS Core is the only writer of these columns.
export class ScopeKey {
  private constructor(private readonly props: TScopeKeyProps) {}

  static restore(props: TScopeKeyProps): ScopeKey {
    return new ScopeKey(props);
  }

  get kind(): ScopeKind {
    return this.props.kind;
  }

  get scopeId(): string {
    return this.props.scopeId;
  }

  get orgId(): string {
    return this.props.orgId;
  }

  get kmsKeyId(): string | null {
    return this.props.kmsKeyId;
  }

  get encryptedDataKey(): Buffer | null {
    return this.props.encryptedDataKey;
  }

  get certificateKmsKeyId(): string | null {
    return this.props.certificateKmsKeyId;
  }

  toJSON(): TScopeKeyProps {
    return this.props;
  }
}
