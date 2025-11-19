import { PamResourceType } from "../enums";
import { TBasePamAccount } from "./base-account";
import { TBasePamResource } from "./base-resource";

// Resources
export type TMcpResource = TBasePamResource & { resourceType: PamResourceType.MCP } & {
  connectionDetails: {
    url: string;
  };
};

// Accounts
export type TMcpAccount = TBasePamAccount & {
  credentials: {
    headers?: { key: string; value: string }[];
  };
};
