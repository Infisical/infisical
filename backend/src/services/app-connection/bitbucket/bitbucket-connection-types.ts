import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  BitBucketConnectionSchema,
  CreateBitBucketConnectionSchema,
  ValidateBitBucketConnectionCredentialsSchema
} from "./bitbucket-connection-schemas";

export type TBitBucketConnection = z.infer<typeof BitBucketConnectionSchema>;

export type TBitBucketConnectionInput = z.infer<typeof CreateBitBucketConnectionSchema> & {
  app: AppConnection.BitBucket;
};

export type TValidateBitBucketConnectionCredentialsSchema = typeof ValidateBitBucketConnectionCredentialsSchema;

export type TBitBucketConnectionConfig = DiscriminativePick<
  TBitBucketConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TBitBucketVault = {
  id: string;
  name: string;
  type: string;
  items: number;

  attributeVersion: number;
  contentVersion: number;

  createdAt: string;
  updatedAt: string;
};
