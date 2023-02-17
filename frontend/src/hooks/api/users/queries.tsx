import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  decryptAssymmetric,
  encryptAssymmetric
} from '@app/components/utilities/cryptography/crypto';
import { apiRequest } from '@app/config/request';
import { setAuthToken } from '@app/reactQuery';

import { useUploadWsKey } from '../keys/queries';
import {
  AddUserToOrgDTO,
  AddUserToWsDTO,
  AddUserToWsRes,
  DeletOrgMembershipDTO,
  OrgUser,
  UpdateOrgUserRoleDTO,
  User
} from './types';

const userKeys = {
  getUser: ['user'] as const,
  getOrgUsers: (orgId: string) => [{ orgId }, 'user']
};

const fetchUserDetails = async () => {
  const { data } = await apiRequest.get<{ user: User }>('/api/v1/user');

  return data.user;
};

export const useGetUser = () => useQuery(userKeys.getUser, fetchUserDetails);

export const fetchOrgUsers = async (orgId: string) => {
  const { data } = await apiRequest.get<{ users: OrgUser[] }>(
    `/api/v1/organization/${orgId}/users`
  );

  return data.users;
};

export const useGetOrgUsers = (orgId: string) =>
  useQuery({
    queryKey: userKeys.getOrgUsers(orgId),
    queryFn: () => fetchOrgUsers(orgId),
    enabled: Boolean(orgId)
  });

// mutation
export const useAddUserToWs = () => {
  const uploadWsKey = useUploadWsKey();

  return useMutation<{ data: AddUserToWsRes }, {}, AddUserToWsDTO>({
    mutationFn: ({ email, workspaceId }) =>
      apiRequest.post(`/api/v1/workspace/${workspaceId}/invite-signup`, { email }),
    onSuccess: ({ data }, { workspaceId }) => {
      const PRIVATE_KEY = localStorage.getItem('PRIVATE_KEY');
      if (!PRIVATE_KEY) return;

      // assymmetrically decrypt symmetric key with local private key
      const key = decryptAssymmetric({
        ciphertext: data.latestKey.encryptedKey,
        nonce: data.latestKey.nonce,
        publicKey: data.latestKey.sender.publicKey,
        privateKey: PRIVATE_KEY
      });

      const { ciphertext: inviteeCipherText, nonce: inviteeNonce } = encryptAssymmetric({
        plaintext: key,
        publicKey: data.invitee.publicKey,
        privateKey: PRIVATE_KEY
      });

      uploadWsKey.mutate({
        encryptedKey: inviteeCipherText,
        nonce: inviteeNonce,
        userId: data.invitee._id,
        workspaceId
      });
    }
  });
};

export const useAddUserToOrg = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, AddUserToOrgDTO>({
    mutationFn: (dto) => apiRequest.post(`/api/v1/invite-org/signup`, dto),
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
    }
  });
};

export const useDeleteOrgMembership = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeletOrgMembershipDTO>({
    mutationFn: ({ membershipId }) => apiRequest.delete(`/api/v1/membership-org/${membershipId}`),
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(orgId));
    }
  });
};

export const useUpdateOrgUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateOrgUserRoleDTO>({
    mutationFn: ({ organizationId, membershipId, role }) =>
      apiRequest.patch(`/api/v2/organizations/${organizationId}/memberships/${membershipId}`, {
        role
      }),
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
    },
    // to remove old states
    onError: (_, { organizationId }) => {
      queryClient.invalidateQueries(userKeys.getOrgUsers(organizationId));
    }
  });
};

export const useLogoutUser = () =>
  useMutation({
    mutationFn: () => apiRequest.post('/api/v1/auth/logout'),
    onSuccess: () => {
      setAuthToken('');
      // Delete the cookie by not setting a value; Alternatively clear the local storage
      localStorage.setItem('publicKey', '');
      localStorage.setItem('encryptedPrivateKey', '');
      localStorage.setItem('iv', '');
      localStorage.setItem('tag', '');
      localStorage.setItem('PRIVATE_KEY', '');
    }
  });
