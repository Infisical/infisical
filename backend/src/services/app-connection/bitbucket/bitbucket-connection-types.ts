import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  BitbucketConnectionSchema,
  CreateBitbucketConnectionSchema,
  ValidateBitbucketConnectionCredentialsSchema
} from "./bitbucket-connection-schemas";

export type TBitbucketConnection = z.infer<typeof BitbucketConnectionSchema>;

export type TBitbucketConnectionInput = z.infer<typeof CreateBitbucketConnectionSchema> & {
  app: AppConnection.Bitbucket;
};

export type TValidateBitbucketConnectionCredentialsSchema = typeof ValidateBitbucketConnectionCredentialsSchema;

export type TBitbucketConnectionConfig = DiscriminativePick<
  TBitbucketConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TGetBitbucketRepositoriesDTO = {
  connectionId: string;
  workspaceSlug: string;
};

export type TBitbucketWorkspace = {
  slug: string;
};

export type TBitbucketRepo = {
  uuid: string;
  full_name: string; // workspace-slug/repo-slug
  slug: string;
};
