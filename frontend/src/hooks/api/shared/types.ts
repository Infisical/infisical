import { IdentityAuthMethod } from "@app/hooks/api";

export enum TemporaryPermissionMode {
  Relative = "relative"
}

export type TMetadata = {
  key: string;
  value: string;
};

export type TIdentity = {
  id: string;
  name: string;
  orgId: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  hasDeleteProtection: boolean;
  // Only an agent may start a session on a user's behalf, and only agents appear in an agent policy.
  isAgent: boolean;
  authMethods: IdentityAuthMethod[];
  activeLockoutAuthMethods: IdentityAuthMethod[];
  metadata?: Array<TMetadata & { id: string }>;
};

export type TRoles = Array<
  | {
      role: string;
      isTemporary?: false;
    }
  | {
      role: string;
      isTemporary: true;
      temporaryMode: TemporaryPermissionMode;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    }
>;
