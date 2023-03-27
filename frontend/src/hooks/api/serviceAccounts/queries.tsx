import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import {
    CreateServiceAccountDTO,
    CreateServiceAccountRes,
    CreateServiceAccountWorkspacePermissionsDTO,
    DeleteServiceAccountRes,
    DeleteServiceAccountWorkspacePermissionsDTO,
    DeleteServiceAccountWorkspacePermissionsRes,
    RenameServiceAccountDTO,
    RenameServiceAccountRes,
    ServiceAccount,
    ServiceAccountWorkspacePermissions} from './types';

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

    return useMutation<RenameServiceAccountRes, {}, RenameServiceAccountDTO>({
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

    return useMutation<DeleteServiceAccountRes, {}, string>({
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
    const { data: { permissions } } = await apiRequest.get<{ permissions: ServiceAccountWorkspacePermissions[] }>(
        `/api/v2/service-accounts/${serviceAccountId}/permissions/workspace`
    );
    
    console.log('fetchServiceAccountProjectLevelPermissions');
    console.log('prrr: ', permissions);

    return permissions;
}

export const useGetServiceAccountProjectLevelPermissions = (serviceAccountId: string) => {
    return useQuery({
        queryKey: serviceAccountKeys.getServiceAccountProjectLevelPermissions(serviceAccountId),
        queryFn: () => fetchServiceAccountProjectLevelPermissions(serviceAccountId),
        enabled: true
    });
}

export const useCreateServiceAccountProjectLevelPermissions = () => {
    const queryClient = useQueryClient();

    return useMutation<CreateServiceAccountRes, {}, CreateServiceAccountWorkspacePermissionsDTO>({
        mutationFn: async (body) => {
            const { data: { permissions } } = await apiRequest.post(`/api/v2/service-accounts/${body.serviceAccountId}/permissions/workspace`, body);
            return permissions;
        },
        onSuccess: ({ serviceAccount }) => {
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccountProjectLevelPermissions(serviceAccount));
        }
    });
}

export const useDeleteServiceAccountProjectLevelPermissions = () => {
    const queryClient = useQueryClient();

    return useMutation<DeleteServiceAccountWorkspacePermissionsRes, {}, DeleteServiceAccountWorkspacePermissionsDTO>({
        mutationFn: async ({ serviceAccountId, serviceAccountWorkspacePermissionsId }) => {
            const { data: { permissions } } = await apiRequest.delete(`/api/v2/service-accounts/${serviceAccountId}/permissions/workspace/${serviceAccountWorkspacePermissionsId}`);
            console.log('useDeleteServiceAccountProjectLevelPermissions');
            console.log('permissions: ', permissions);
            return permissions;
        },
        onSuccess: ({ serviceAccount }) => {
            console.log('onSuccess3: ', serviceAccount);
            queryClient.invalidateQueries(serviceAccountKeys.getServiceAccountProjectLevelPermissions(serviceAccount));
            // queryClient.invalidateQueries(serviceAccountKeys.getServiceAccounts(organization));
        }
    });
}