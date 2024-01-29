import { TProjectPermission } from "@app/lib/types";

export type TCreateIpDTO = TProjectPermission & {
  comment: string;
  isActive?: boolean;
  ipAddress: string;
};

export type TUpdateIpDTO = TProjectPermission & {
  trustedIpId: string;
  ipAddress: string;
  comment: string;
};

export type TDeleteIpDTO = TProjectPermission & {
  trustedIpId: string;
};
