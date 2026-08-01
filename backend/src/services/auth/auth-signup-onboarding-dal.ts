import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSignupOnboardingResponseDALFactory = ReturnType<typeof signupOnboardingResponseDALFactory>;

export const signupOnboardingResponseDALFactory = (db: TDbClient) => ormify(db, TableName.SignupOnboardingResponse);
