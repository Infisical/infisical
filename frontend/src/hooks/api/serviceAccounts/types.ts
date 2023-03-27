export type ServiceAccount = {
    _id: string;
    name: string;
    organization: string;
    user: string;
    publicKey: string;
    expiresAt: string;
}

export type CreateServiceAccountDTO = {
    name: string;
    organizationId: string;
    publicKey: string;
    expiresIn: number;
}

export type CreateServiceAccountRes = {
    serviceAccount: ServiceAccount;
    serviceAccountAccessKey: string;
}

export type DeleteServiceAccountRes = {
    serviceAccount: ServiceAccount;
}

export type RenameServiceAccountDTO = {
    serviceAccountId: string;
    name: string;
}

export type RenameServiceAccountRes = {
    serviceAccount: ServiceAccount;
}

export type ServiceAccountWorkspacePermissions = {
    serviceAccount: string;
    workspace: string;
    environment: string;
    canRead: boolean;
    canWrite: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}

export type CreateServiceAccountWorkspacePermissionsDTO = {
    serviceAccountId: string;
    workspaceId: string;
    environment: string;
    canRead: boolean;
    canWrite: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}

export type CreateServiceAccountWorkspacePermissionsRes = {
    permissions: ServiceAccountWorkspacePermissions 
}

export type DeleteServiceAccountWorkspacePermissionsDTO = {
    serviceAccountId: string;
    serviceAccountWorkspacePermissionsId: string;
}

export type DeleteServiceAccountWorkspacePermissionsRes = {
    permissions: ServiceAccountWorkspacePermissions
}