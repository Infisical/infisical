import type { TSharedSecret, TSharedSecretActor } from "./model/shared-secret";

export type { TSharedSecret, TSharedSecretActor };

export type TCreateSharedSecretInput = {
  name?: string;
  value: string;
  expiresAt: Date;
  maxViews?: number;
};

export type TSecretSharingService = {
  createSharedSecret: (actor: TSharedSecretActor, input: TCreateSharedSecretInput) => Promise<TSharedSecret>;
};
