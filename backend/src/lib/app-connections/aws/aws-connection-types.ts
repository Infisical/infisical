import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AwsConnectionSchema } from "./aws-connection-schemas";

export type TAwsConnection = z.infer<typeof AwsConnectionSchema>;

export type TAwsConnectionConfig = DiscriminativePick<TAwsConnection, "orgId" | "method" | "app" | "credentials">;
