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

export type TSharedSecret = Readonly<{
  id: string;
  orgId: string;
  createdByUserId: string | null;
  createdByIdentityId: string | null;
  name: string | null;
  encryptedValue: Buffer;
  expiresAt: Date;
  remainingViews: number | null;
  lastViewedAt: Date | null;
}>;

export const createSharedSecret = ({
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
}): TSharedSecret => {
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

  return {
    id: crypto.nativeCrypto.randomUUID(),
    orgId: actor.orgId,
    createdByUserId: actor.type === "user" ? actor.id : null,
    createdByIdentityId: actor.type === "identity" ? actor.id : null,
    name: name ?? null,
    encryptedValue,
    expiresAt,
    remainingViews: maxViews ?? null,
    lastViewedAt: null
  };
};

export const recordSharedSecretView = (sharedSecret: TSharedSecret, now: Date): TSharedSecret => {
  if (sharedSecret.expiresAt.getTime() <= now.getTime()) {
    throw new BadRequestError({ message: "This shared secret has expired" });
  }
  if (sharedSecret.remainingViews === 0) {
    throw new BadRequestError({ message: "This shared secret has reached its view limit" });
  }

  return {
    ...sharedSecret,
    remainingViews: sharedSecret.remainingViews === null ? null : sharedSecret.remainingViews - 1,
    lastViewedAt: now
  };
};

export const assertSharedSecretDeletableBy = (sharedSecret: TSharedSecret, actor: TSharedSecretActor) => {
  const createdByActor =
    actor.type === "user" ? sharedSecret.createdByUserId === actor.id : sharedSecret.createdByIdentityId === actor.id;

  if (!createdByActor || sharedSecret.orgId !== actor.orgId) {
    throw new ForbiddenRequestError({ message: "Only the creator of a shared secret can delete it" });
  }
};
