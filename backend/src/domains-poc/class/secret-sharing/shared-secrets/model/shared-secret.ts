import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";

export type TSharedSecretActor = {
  type: "user" | "identity";
  id: string;
  orgId: string;
};

export const SHARED_SECRET_NAME_MAX_LENGTH = 255;
export const SHARED_SECRET_VALUE_MAX_LENGTH = 10_000;
export const SHARED_SECRET_MAX_VIEWS = 1000;
export const SHARED_SECRET_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type TSharedSecretProps = {
  id: string;
  orgId: string;
  createdByUserId: string | null;
  createdByIdentityId: string | null;
  name: string | null;
  encryptedValue: Buffer;
  expiresAt: Date;
  remainingViews: number | null;
  lastViewedAt: Date | null;
};

export class SharedSecret {
  private constructor(private props: TSharedSecretProps) {}

  static create({
    actor,
    name,
    encryptedValue,
    expiresAt,
    maxViews,
    now
  }: {
    actor: TSharedSecretActor;
    name?: string;
    encryptedValue: Buffer;
    expiresAt: Date;
    maxViews?: number;
    now: Date;
  }): SharedSecret {
    if (expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestError({ message: "Expiration time must be in the future" });
    }
    if (expiresAt.getTime() - now.getTime() > SHARED_SECRET_MAX_LIFETIME_MS) {
      throw new BadRequestError({ message: "A shared secret can't be valid for more than 30 days" });
    }
    if (maxViews !== undefined && (maxViews < 1 || maxViews > SHARED_SECRET_MAX_VIEWS)) {
      throw new BadRequestError({ message: `Max views must be between 1 and ${SHARED_SECRET_MAX_VIEWS}` });
    }
    if (name !== undefined && name.length > SHARED_SECRET_NAME_MAX_LENGTH) {
      throw new BadRequestError({ message: `Name can't be longer than ${SHARED_SECRET_NAME_MAX_LENGTH} characters` });
    }

    return new SharedSecret({
      id: crypto.nativeCrypto.randomUUID(),
      orgId: actor.orgId,
      createdByUserId: actor.type === "user" ? actor.id : null,
      createdByIdentityId: actor.type === "identity" ? actor.id : null,
      name: name ?? null,
      encryptedValue,
      expiresAt,
      remainingViews: maxViews ?? null,
      lastViewedAt: null
    });
  }

  static restore(props: TSharedSecretProps): SharedSecret {
    return new SharedSecret(props);
  }

  get id() {
    return this.props.id;
  }

  get orgId() {
    return this.props.orgId;
  }

  get name() {
    return this.props.name;
  }

  get encryptedValue() {
    return this.props.encryptedValue;
  }

  get expiresAt() {
    return this.props.expiresAt;
  }

  get remainingViews() {
    return this.props.remainingViews;
  }

  recordView(now: Date) {
    if (this.props.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestError({ message: "This shared secret has expired" });
    }
    if (this.props.remainingViews === 0) {
      throw new BadRequestError({ message: "This shared secret has reached its view limit" });
    }

    if (this.props.remainingViews !== null) {
      this.props.remainingViews -= 1;
    }
    this.props.lastViewedAt = now;
  }

  assertCanBeDeletedBy(actor: TSharedSecretActor) {
    const createdByActor =
      actor.type === "user" ? this.props.createdByUserId === actor.id : this.props.createdByIdentityId === actor.id;

    if (!createdByActor || this.props.orgId !== actor.orgId) {
      throw new ForbiddenRequestError({ message: "Only the creator of a shared secret can delete it" });
    }
  }

  toProps(): TSharedSecretProps {
    return {
      id: this.props.id,
      orgId: this.props.orgId,
      createdByUserId: this.props.createdByUserId,
      createdByIdentityId: this.props.createdByIdentityId,
      name: this.props.name,
      encryptedValue: this.props.encryptedValue,
      expiresAt: this.props.expiresAt,
      remainingViews: this.props.remainingViews,
      lastViewedAt: this.props.lastViewedAt
    };
  }
}
