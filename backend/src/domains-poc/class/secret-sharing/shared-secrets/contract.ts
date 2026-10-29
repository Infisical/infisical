import type { SharedSecret, TSharedSecretActor } from "./model/shared-secret";

export type { SharedSecret, TSharedSecretActor };

export type TCreateSharedSecretInput = {
  name?: string;
  value: string;
  expiresAt: Date;
  maxViews?: number;
};

export interface TSecretSharingService {
  createSharedSecret(actor: TSharedSecretActor, input: TCreateSharedSecretInput): Promise<SharedSecret>;
}
