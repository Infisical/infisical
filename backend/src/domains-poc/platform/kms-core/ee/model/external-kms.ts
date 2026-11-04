import { crypto } from "@app/lib/crypto/cryptography";

export type TExternalKmsProps = {
  id: string;
  kmsKeyId: string;
  provider: string;
};

export class ExternalKms {
  private constructor(private readonly props: TExternalKmsProps) {}

  static create({ kmsKeyId, provider }: { kmsKeyId: string; provider: string }): ExternalKms {
    return new ExternalKms({ id: crypto.nativeCrypto.randomUUID(), kmsKeyId, provider });
  }

  static restore(props: TExternalKmsProps): ExternalKms {
    return new ExternalKms(props);
  }

  get id() {
    return this.props.id;
  }

  get kmsKeyId() {
    return this.props.kmsKeyId;
  }

  get provider() {
    return this.props.provider;
  }

  toProps(): TExternalKmsProps {
    return { ...this.props };
  }
}
