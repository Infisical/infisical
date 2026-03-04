import { z } from "zod";

import { TSmbConnection } from "@app/services/app-connection/smb";

import {
  CreateWindowsLocalAccountRotationSchema,
  WindowsLocalAccountRotationGeneratedCredentialsSchema,
  WindowsLocalAccountRotationListItemSchema,
  WindowsLocalAccountRotationSchema
} from "./windows-local-account-rotation-schemas";

export type TWindowsLocalAccountRotation = z.infer<typeof WindowsLocalAccountRotationSchema>;

export type TWindowsLocalAccountRotationInput = z.infer<typeof CreateWindowsLocalAccountRotationSchema>;

export type TWindowsLocalAccountRotationListItem = z.infer<typeof WindowsLocalAccountRotationListItemSchema>;

export type TWindowsLocalAccountRotationWithConnection = TWindowsLocalAccountRotation & {
  connection: TSmbConnection;
};

export type TWindowsLocalAccountRotationGeneratedCredentials = z.infer<
  typeof WindowsLocalAccountRotationGeneratedCredentialsSchema
>;
