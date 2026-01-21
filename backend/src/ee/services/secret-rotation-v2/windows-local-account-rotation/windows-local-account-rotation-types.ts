import { z } from "zod";

import { TSshConnection } from "@app/services/app-connection/ssh";

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
  connection: TSshConnection;
};

export type TWindowsLocalAccountRotationGeneratedCredentials = z.infer<
  typeof WindowsLocalAccountRotationGeneratedCredentialsSchema
>;
