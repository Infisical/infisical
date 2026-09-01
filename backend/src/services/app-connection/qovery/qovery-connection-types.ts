import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  CreateQoveryConnectionSchema,
  QoveryConnectionSchema,
  ValidateQoveryConnectionCredentialsSchema
} from "./qovery-connection-schemas";

export type TQoveryConnection = z.infer<typeof QoveryConnectionSchema>;

export type TQoveryConnectionInput = z.infer<typeof CreateQoveryConnectionSchema> & {
  app: AppConnection.Qovery;
};

export type TValidateQoveryConnectionCredentialsSchema = typeof ValidateQoveryConnectionCredentialsSchema;

export type TQoveryConnectionConfig = DiscriminativePick<TQoveryConnectionInput, "method" | "app" | "credentials">;

export type TQoveryPaginatedResponse<T> = {
  results?: T[];
  pagination?: {
    page: number;
    page_size: number;
    total_count: number;
    total_pages: number;
  };
};
