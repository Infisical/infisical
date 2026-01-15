import { z } from "zod";

import { TSshConnection } from "@app/services/app-connection/ssh";

import {
  CreateUnixLinuxLocalAccountRotationSchema,
  UnixLinuxLocalAccountRotationGeneratedCredentialsSchema,
  UnixLinuxLocalAccountRotationListItemSchema,
  UnixLinuxLocalAccountRotationSchema
} from "./unix-linux-local-account-rotation-schemas";

export type TUnixLinuxLocalAccountRotation = z.infer<typeof UnixLinuxLocalAccountRotationSchema>;

export type TUnixLinuxLocalAccountRotationInput = z.infer<typeof CreateUnixLinuxLocalAccountRotationSchema>;

export type TUnixLinuxLocalAccountRotationListItem = z.infer<typeof UnixLinuxLocalAccountRotationListItemSchema>;

export type TUnixLinuxLocalAccountRotationWithConnection = TUnixLinuxLocalAccountRotation & {
  connection: TSshConnection;
};

export type TUnixLinuxLocalAccountRotationGeneratedCredentials = z.infer<
  typeof UnixLinuxLocalAccountRotationGeneratedCredentialsSchema
>;
