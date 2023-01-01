import { Omit } from 'utility-types';
import { ISecret } from '../../models';

export type ModifySecretPayload = Omit<ISecret, "user" | "version" | "environment" | "workspace">;

export type SafeUpdateSecret = Partial<Omit<ISecret, "user" | "version" | "environment" | "workspace">>;
