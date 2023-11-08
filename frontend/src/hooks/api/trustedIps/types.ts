export type TrustedIp = {
  _id: string;
  workspace: string;
  ipAddress: string;
  type: "ipv4" | "ipv6";
  isActive: boolean;
  comment: string;
  environment: string;
  prefix?: number;
};
