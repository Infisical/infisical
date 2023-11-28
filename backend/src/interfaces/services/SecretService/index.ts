import { Types } from "mongoose";
import { AuthData } from "../../middleware";

export interface CreateSecretParams {
  secretName: string;
  workspaceId: Types.ObjectId;
  environment: string;
  type: "shared" | "personal";
  authData: AuthData;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentCiphertext?: string;
  secretCommentIV?: string;
  secretCommentTag?: string;
  skipMultilineEncoding?: boolean;
  secretPath: string;
  metadata?: {
    source?: string;
  };
}

export interface GetSecretsParams {
  workspaceId: Types.ObjectId;
  environment: string;
  secretPath: string;
  authData: AuthData;
}

export interface GetSecretParams {
  secretName: string;
  workspaceId: Types.ObjectId;
  secretPath: string;
  environment: string;
  type?: "shared" | "personal";
  authData: AuthData;
  include_imports?: boolean;
}

export interface UpdateSecretParams {
  secretName: string;
  newSecretName?: string;
  secretId?: string;
  secretKeyCiphertext?: string;
  secretKeyIV?: string;
  secretKeyTag?: string;
  workspaceId: Types.ObjectId;
  environment: string;
  type: "shared" | "personal";
  authData: AuthData;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretPath: string;
  secretCommentCiphertext?: string;
  secretCommentIV?: string;
  secretCommentTag?: string;

  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;

  skipMultilineEncoding?: boolean;
  tags?: string[];
}

export interface DeleteSecretParams {
  secretName: string;
  secretId?: string;
  workspaceId: Types.ObjectId;
  environment: string;
  type: "shared" | "personal";
  authData: AuthData;
  secretPath: string;
}

export interface CreateSecretBatchParams {
  workspaceId: Types.ObjectId;
  environment: string;
  authData: AuthData;
  secretPath: string;
  secrets: Array<{
    secretName: string;
    type: "shared" | "personal";
    secretKeyCiphertext: string;
    secretKeyIV: string;
    secretKeyTag: string;
    secretValueCiphertext: string;
    secretValueIV: string;
    secretValueTag: string;
    secretCommentCiphertext?: string;
    secretCommentIV?: string;
    secretCommentTag?: string;
    skipMultilineEncoding?: boolean;
    metadata?: {
      source?: string;
    };
  }>;
}

export interface UpdateSecretBatchParams {
  workspaceId: Types.ObjectId;
  environment: string;
  authData: AuthData;
  secretPath: string;
  secrets: Array<{
    secretName: string;
    type: "shared" | "personal";
    secretValueCiphertext: string;
    secretValueIV: string;
    secretValueTag: string;
    secretCommentCiphertext?: string;
    secretCommentIV?: string;
    secretCommentTag?: string;
    skipMultilineEncoding?: boolean;
    tags?: string[];
  }>;
}

export interface DeleteSecretBatchParams {
  workspaceId: Types.ObjectId;
  environment: string;
  authData: AuthData;
  secretPath: string;
  secrets: Array<{
    secretName: string;
    type: "shared" | "personal";
  }>;
}
