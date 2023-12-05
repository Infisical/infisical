import { TRole } from "../roles/types";

export type MachineTrustedIp = {
    _id: string;
    ipAddress: string;
    type: "ipv4" | "ipv6";
    prefix?: number;
}

export type MachineIdentity = {
    _id: string;
    clientId: string;
    name: string;
    organization: string;
    isActive: boolean;
    accessTokenTTL: number;
    accessTokenLastUsed?: string;
    accessTokenUsageCount: number;
    clientSecretTrustedIps: MachineTrustedIp[];
    accessTokenTrustedIps: MachineTrustedIp[];
    createdAt: string;
    updatedAt: string;
};

export type MachineIdentityClientSecret = {
    _id: string;
    machineIdentity: string;
    isActive: boolean;
    description: string;
    clientSecretPrefix: string;
    clientSecretNumUses: number;
    clientSecretNumUsesLimit: number;
    clientSecretTTL: number;
    createdAt: string;
    updatedAt: string;
}

export type MachineMembershipOrg = {
    _id: string;
    machineIdentity: MachineIdentity;
    organization: string;
    role: "admin" | "member" | "viewer" | "no-access" | "custom";
    customRole?: TRole<string>;
    createdAt: string;
    updatedAt: string;
}

export type MachineMembership = {
    _id: string;
    machineIdentity: MachineIdentity;
    organization: string;
    role: "admin" | "member" | "viewer" | "no-access" | "custom";
    customRole?: TRole<string>;
    createdAt: string;
    updatedAt: string;
}

export type CreateMachineIdentityDTO = {
    name: string;
    organizationId: string;
    role?: string;
    clientSecretTrustedIps: {
      ipAddress: string;
    }[];
    accessTokenTrustedIps: {
      ipAddress: string;
    }[];
    accessTokenTTL: number;
}

export type CreateMachineIdentityClientSecretDTO = {
    machineId: string;
    description?: string;
    ttl?: number;
    usageLimit?: number;
}

export type CreateMachineIdentityClientSecretRes = {
    clientSecret: string;
    machineIdentity: string;
    isActive: boolean;
    description: string;
    clientSecretNumUses: number;
    clientSecretNumUsesLimit: number;
    expiresAt?: Date;
}

export type CreateMachineIdentityRes = {
    machineIdentity: MachineIdentity;
}

export type UpdateMachineIdentityDTO = {
    machineId: string;
    name?: string;
    role?: string;
    clientSecretTrustedIps?: {
        ipAddress: string;
    }[];
    accessTokenTrustedIps?: {
        ipAddress: string;
    }[];
    accessTokenTTL?: number;
}

export type DeleteMachineIdentityDTO = {
    machineId: string;
}