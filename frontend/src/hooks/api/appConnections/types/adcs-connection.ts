import { z } from "zod";

import { AppConnection } from "../enums";
import { TRootAppConnection } from "./root-connection";

export enum AdcsConnectionMethod {
  UsernamePassword = "username-password"
}

export const CreateAdcsConnectionSchema = z.object({
  caHost: z.string().min(1, "CA Host is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
});

export type TCreateAdcsConnection = z.infer<typeof CreateAdcsConnectionSchema>;

export type TAdcsConnection = TRootAppConnection & { app: AppConnection.ADCS } & {
  method: AdcsConnectionMethod.UsernamePassword;
  credentials: TCreateAdcsConnection;
};
