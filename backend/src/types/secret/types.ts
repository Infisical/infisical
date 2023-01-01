import { Omit } from 'utility-types';
import { ISecret } from '../../models';

// User input for CRUD operations on secrets routes
export type SecretUserInput = Omit<ISecret, "user" | "version" | "environment" | "workspace">;

// Used for modeling sanitized secrets before uplaod. To be used for converting user input for uploading
export type SanitizedSecretModify = Partial<Omit<ISecret, "user" | "version" | "environment" | "workspace">>;

// Used for modeling sanitized secrets before create. To be used for converting user input for creating new secrets
export type SanitizedSecretForCreate = Omit<ISecret, "version" | "_id">;
