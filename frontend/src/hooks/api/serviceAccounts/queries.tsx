import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import {
    CreateServiceAccountDTO,
    CreateServiceAccountRes,
    CreateServiceAccountWorkspacePermissionDTO,
    DeleteServiceAccountWorkspacePermissionDTO,
    RenameServiceAccountDTO,
    ServiceAccount,
    ServiceAccountWorkspacePermission
} from './types';

const serviceAccountKeys = {
    getServiceAccountById: (serviceAccountId: string) => [{ serviceAccountId }, 'service-account'] as const,
    getServiceAccounts: (organizationID: string) => [{ organizationID }, 'service-accounts'] as const,
    getServiceAccountProjectLevelPermissions: (serviceAccountId: string) => [{ serviceAccountId }, 'service-account-project-level-permissions'] as const
}

const fetchServiceAccounts = async (organizationID: string) => {
    const { data } = await apiRequest.get<{ serviceAccounts: ServiceAccount[] }>(
        `/api/v2/organizations/${organizationID}/service-accounts`
    );

    return data.serviceAccounts;
}

const fetchServiceAccountById = async (serviceAccountId: string) => {
    const { data } = await apiRequest.get<{ serviceAccount: ServiceAccount }>(
        `/api/v2/service-accounts/${serviceAccountId}`
    );

    return data.serviceAccount;
}

export const useGetServiceAccounts = (organizationID: string) =>
    useQuery({
        queryKey: serviceAccountKeys.getServiceAccounts(organizationID),
        queryFn: () => fetchServiceAccounts(organizationID),
        enabled: Boolean(organizationID)
    });

export const useGetServiceAccountById = (serviceAccountId: string) => {
    return useQuery({
        queryKey: serviceAccountKeys.getServiceAccountById(serviceAccountId),
        queryFn: () => fetchServiceAccountById(serviceAccountId),
        enabled: true
    });
}

export const useCreateServiceAccount = () => {
    const queryClient = useQueryClient();

    return useMutation<CreateServiceAccountRes, {}, CreateServiceAccountDTO>({
        mutationFn: async (body) => {
            const { data } = await apiRequest.post('/api/v2/service-accounts/', body);
            return data;
        },
        onSuccess: ({ serviceAccount }) => {
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccounts(serviceAccount.organization));
        }
    });
}

export const useRenameServiceAccount = () => {
    const queryClient = useQueryClient();

    return useMutation<ServiceAccount, {}, RenameServiceAccountDTO>({
        mutationFn: async ({ serviceAccountId, name }) => {
            const { data: { serviceAccount } } = await apiRequest.patch(`/api/v2/service-accounts/${serviceAccountId}/name`, { name });
            return serviceAccount;
        },
        onSuccess: (serviceAccount) => {
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccountById(serviceAccount._id));
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccounts(serviceAccount.organization));
        }
    });
}

export const useDeleteServiceAccount = () => {
    const queryClient = useQueryClient();

    return useMutation<ServiceAccount, {}, string>({
        mutationFn: async (serviceAccountId) => {
            const { data: { serviceAccount } } = await apiRequest.delete(`/api/v2/service-accounts/${serviceAccountId}`);
            return serviceAccount;
        },
        onSuccess: ({ organization }) => {
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccounts(organization));
        }
    });
}

const fetchServiceAccountProjectLevelPermissions = async (serviceAccountId: string) => {
    const { data: { serviceAccountWorkspacePermissions } } = await apiRequest.get<{ serviceAccountWorkspacePermissions: ServiceAccountWorkspacePermission[] }>(
        `/api/v2/service-accounts/${serviceAccountId}/permissions/workspace`
    );
    
    return serviceAccountWorkspacePermissions;
}

export const useGetServiceAccountProjectLevelPermissions = (serviceAccountId: string) => {
    return useQuery({
        queryKey: serviceAccountKeys.getServiceAccountProjectLevelPermissions(serviceAccountId),
        queryFn: () => fetchServiceAccountProjectLevelPermissions(serviceAccountId),
        enabled: true
    });
}

export const useCreateServiceAccountProjectLevelPermission = () => {
    const queryClient = useQueryClient();

    return useMutation<ServiceAccountWorkspacePermission, {}, CreateServiceAccountWorkspacePermissionDTO>({
        mutationFn: async (body) => {
            const { data: { serviceAccountWorkspacePermission } } = await apiRequest.post(`/api/v2/service-accounts/${body.serviceAccountId}/permissions/workspace`, body);
            return serviceAccountWorkspacePermission;
        },
        onSuccess: ({ serviceAccount }) => {
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccountProjectLevelPermissions(serviceAccount));
        }
    });
}

export const useDeleteServiceAccountProjectLevelPermission = () => {
    const queryClient = useQueryClient();

    return useMutation<ServiceAccountWorkspacePermission, {}, DeleteServiceAccountWorkspacePermissionDTO>({
        mutationFn: async ({ serviceAccountId, serviceAccountWorkspacePermissionId }) => {
            const { data: { serviceAccountWorkspacePermission} } = await apiRequest.delete(`/api/v2/service-accounts/${serviceAccountId}/permissions/workspace/${serviceAccountWorkspacePermissionId}`);
            return serviceAccountWorkspacePermission;
        },
        onSuccess: (serviceAccountWorkspacePermission) => {
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccountProjectLevelPermissions(serviceAccountWorkspacePermission.serviceAccount));
        }
    });
}