import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { TRootAppConnection } from "@app/hooks/api/appConnections/types/root-connection";

export enum Rfc2136ConnectionMethod {
  TsigKey = "tsig-key"
}

export enum TsigAlgorithm {
  HmacSha256 = "hmac-sha256",
  HmacSha384 = "hmac-sha384",
  HmacSha512 = "hmac-sha512",
  HmacSha224 = "hmac-sha224",
  HmacSha1 = "hmac-sha1"
}

export type TRfc2136Connection = TRootAppConnection & { app: AppConnection.Rfc2136 } & {
  method: Rfc2136ConnectionMethod.TsigKey;
  credentials: {
    host: string;
    port: number;
    tsigKeyName: string;
    tsigAlgorithm: TsigAlgorithm;
    tsigSecret: string;
  };
};
