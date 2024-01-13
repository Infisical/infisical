export type TrustedIp = {
  id: string;
  projectId: string;
  ipAddress: string;
  type: "ipv4" | "ipv6";
  isActive: boolean;
  comment: string;
  prefix?: number;
};
