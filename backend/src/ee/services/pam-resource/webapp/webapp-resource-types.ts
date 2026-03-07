import { z } from "zod";

import {
  WebAppAccountCredentialsSchema,
  WebAppAccountSchema,
  WebAppResourceConnectionDetailsSchema,
  WebAppResourceSchema
} from "./webapp-resource-schemas";

// Resources
export type TWebAppResource = z.infer<typeof WebAppResourceSchema>;
export type TWebAppResourceConnectionDetails = z.infer<typeof WebAppResourceConnectionDetailsSchema>;

// Accounts
export type TWebAppAccount = z.infer<typeof WebAppAccountSchema>;
export type TWebAppAccountCredentials = z.infer<typeof WebAppAccountCredentialsSchema>;
