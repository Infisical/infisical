import { Assign, Omit } from "utility-types";
import { ISecret } from "../../models";

// Everything is required, except the omitted types
export type CreateSecretRequestBody = Omit<
  ISecret,
  "user" | "version" | "environment" | "workspace"
>;

// Omit the listed properties, then make everything optional and then make _id required
export type ModifySecretRequestBody = Assign<
  Partial<Omit<ISecret, "user" | "version" | "environment" | "workspace">>,
  { _id: string }
>;

// Used for modeling sanitized secrets before uplaod. To be used for converting user input for uploading
export type SanitizedSecretModify = Partial<
  Omit<ISecret, "user" | "version" | "environment" | "workspace">
>;

// Everything is required, except the omitted types
export type SanitizedSecretForCreate = Omit<ISecret, "version" | "_id">;

export interface BatchSecretRequest {
  id: string;
  method: "POST" | "PATCH" | "DELETE";
  secret: Secret;
}

export interface BatchSecret {
  version?: number;
  _id?: string;
  user?: string;
  environment: string;
  workspace?: string;
  algorithm?: string;
  keyEncoding?: string;
  type: "shared" | "personal";
  secretName: string;
  secretBlindIndex: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  tags: string[];
  folder: string;
}
