import { TRole } from "../roles/types";

export type MachineTrustedIp = {
    _id: string;
    ipAddress: string;
    type: "ipv4" | "ipv6";
    prefix?: number;
}

export type MachineIdentity = {
    _id: string;
    name: string;
    organization: string;
    isActive: boolean;
    refreshTokenLastUsed?: string;
    accessTokenLastUsed?: string;
    refreshTokenUsageCount: number;
    accessTokenUsageCount: number;
    trustedIps: MachineTrustedIp[];
    expiresAt?: string;
    accessTokenTTL: number;
    isRefreshTokenRotationEnabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type MachineMembershipOrg = {
    _id: string;
    machineIdentity: MachineIdentity;
    organization: string;
    role: "admin" | "member" | "viewer" | "custom";
    customRole?: TRole;
    createdAt: string;
    updatedAt: string;
}

export type MachineMembership = {
    _id: string;
    machineIdentity: MachineIdentity;
    organization: string;
    role: "admin" | "member" | "viewer" | "custom";
    customRole?: TRole;
    createdAt: string;
    updatedAt: string;
}

export type CreateMachineIdentityDTO = {
    name: string;
    organizationId: string;
    role?: string;
    trustedIps: {
      ipAddress: string;
    }[];
    expiresIn?: number;
    accessTokenTTL: number;
    isRefreshTokenRotationEnabled: boolean;
}

export type CreateMachineIdentityRes = {
    refreshToken: string;
    machineIdentity: MachineIdentity;
}

export type UpdateMachineIdentityDTO = {
    machineId: string;
    isActive?: boolean;
    name?: string;
    role?: string;
    trustedIps?: {
        ipAddress: string;
    }[];
    expiresIn?: number;
    accessTokenTTL?: number;
    isRefreshTokenRotationEnabled?: boolean;
}

export type DeleteMachineIdentityDTO = {
    machineId: string;
}