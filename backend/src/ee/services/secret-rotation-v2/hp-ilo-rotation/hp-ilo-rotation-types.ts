import { z } from "zod";

import { TSshConnection } from "@app/services/app-connection/ssh";

import {
  CreateHpIloRotationSchema,
  HpIloRotationGeneratedCredentialsSchema,
  HpIloRotationListItemSchema,
  HpIloRotationSchema
} from "./hp-ilo-rotation-schemas";

export type THpIloRotation = z.infer<typeof HpIloRotationSchema>;

export type THpIloRotationInput = z.infer<typeof CreateHpIloRotationSchema>;

export type THpIloRotationListItem = z.infer<typeof HpIloRotationListItemSchema>;

export type THpIloRotationWithConnection = THpIloRotation & {
  connection: TSshConnection;
};

export type THpIloRotationGeneratedCredentials = z.infer<typeof HpIloRotationGeneratedCredentialsSchema>;
