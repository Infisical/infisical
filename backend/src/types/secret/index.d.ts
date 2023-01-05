import { Assign, Omit } from 'utility-types';
import { ISecret } from '../../models';

// Everything is required, except the omitted types
export type CreateSecretRequestBody = Omit<ISecret, "user" | "version" | "environment" | "workspace">;

// Omit the listed properties, then make everything optional and then make _id required 
export type ModifySecretRequestBody = Assign<Partial<Omit<ISecret, "user" | "version" | "environment" | "workspace">>, { _id: string }>;

// Used for modeling sanitized secrets before uplaod. To be used for converting user input for uploading
export type SanitizedSecretModify = Partial<Omit<ISecret, "user" | "version" | "environment" | "workspace">>;

// Everything is required, except the omitted types
export type SanitizedSecretForCreate = Omit<ISecret, "version" | "_id">;
