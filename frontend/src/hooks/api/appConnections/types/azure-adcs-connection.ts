import { z } from "zod";

import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum AzureADCSConnectionMethod {
  UsernamePassword = "username-password"
}

export const CreateAzureADCSConnectionSchema = z.object({
  adcsUrl: z.string().url().min(1, "ADCS URL is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});

export type TCreateAzureADCSConnection = z.infer<typeof CreateAzureADCSConnectionSchema>;

export type TAzureADCSConnection = TRootAppConnection & { app: AppConnection.AzureADCS } & {
  method: AzureADCSConnectionMethod.UsernamePassword;
  credentials: {
    username: string;
    password: string;
    adcsUrl: string;
  };
};
