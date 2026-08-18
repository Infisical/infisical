import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { approvalRequestQuery } from "@app/hooks/api/approvalRequests/queries";

import { signerKeys } from "./queries";
import {
  SignerStatus,
  TAddSignerGroupMemberDTO,
  TAddSignerIdentityMemberDTO,
  TAddSignerUserMembersDTO,
  TCreateSignerDTO,
  TDeleteSignerDTO,
  TDisableSignerDTO,
  TEnableSignerDTO,
  TPreApproveSigningDTO,
  TReissueSignerCertificateDTO,
  TRemoveSignerGroupDTO,
  TRemoveSignerIdentityDTO,
  TRemoveSignerUserDTO,
  TRequestToSignDTO,
  TRevokeSignerRequestDTO,
  TSigner,
  TSignerMember,
  TSignerPolicy,
  TUpdateSignerDTO,
  TUpdateSignerGroupRoleDTO,
  TUpdateSignerIdentityRoleDTO,
  TUpdateSignerPolicyDTO,
  TUpdateSignerUserRoleDTO
} from "./types";

export const useCreateSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TCreateSignerDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<TSigner>("/api/v1/cert-manager/signers", dto);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) });
      createNotification({ text: "Signer created successfully", type: "success" });
    }
  });
};

export const useUpdateSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TUpdateSignerDTO>({
    mutationFn: async ({ signerId, ...body }) => {
      const { data } = await apiRequest.patch<TSigner>(
        `/api/v1/cert-manager/signers/${signerId}`,
        body
      );
      return data;
    },
    onSuccess: (signer) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.list(signer.projectId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.byId(signer.id) });
      createNotification({ text: "Signer updated successfully", type: "success" });
    }
  });
};

export const useDeleteSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TDeleteSignerDTO & { projectId: string }>({
    mutationFn: async ({ signerId }) => {
      const { data } = await apiRequest.delete<TSigner>(`/api/v1/cert-manager/signers/${signerId}`);
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.list(projectId) });
      createNotification({ text: "Signer deleted successfully", type: "success" });
    }
  });
};

export const useEnableSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TEnableSignerDTO>({
    mutationFn: async ({ signerId }) => {
      const { data } = await apiRequest.patch<TSigner>(
        `/api/v1/cert-manager/signers/${signerId}/status`,
        { status: "active" }
      );
      return data;
    },
    onSuccess: (signer) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.byId(signer.id) });
      queryClient.invalidateQueries({ queryKey: signerKeys.list(signer.projectId) });
      createNotification({ text: "Signer enabled", type: "success" });
    }
  });
};

export const useDisableSigner = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TDisableSignerDTO>({
    mutationFn: async ({ signerId }) => {
      const { data } = await apiRequest.patch<TSigner>(
        `/api/v1/cert-manager/signers/${signerId}/status`,
        { status: "disabled" }
      );
      return data;
    },
    onSuccess: (signer) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.byId(signer.id) });
      queryClient.invalidateQueries({ queryKey: signerKeys.list(signer.projectId) });
      createNotification({ text: "Signer disabled", type: "success" });
    }
  });
};

export const useReissueSignerCertificate = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, TReissueSignerCertificateDTO>({
    mutationFn: async ({ signerId, ...body }) => {
      const { data } = await apiRequest.post<TSigner>(
        `/api/v1/cert-manager/signers/${signerId}/certificate/reissue`,
        body
      );
      return data;
    },
    onSuccess: (signer) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.byId(signer.id) });
      queryClient.invalidateQueries({ queryKey: signerKeys.list(signer.projectId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.certificate(signer.id) });
      createNotification({ text: "Certificate re-issue scheduled", type: "success" });
    }
  });
};

export const useCheckSignerIssuance = () => {
  const queryClient = useQueryClient();

  return useMutation<TSigner, object, string>({
    mutationFn: async (signerId) => {
      const { data } = await apiRequest.post<TSigner>(
        `/api/v1/cert-manager/signers/${signerId}/issuance/check`
      );
      return data;
    },
    onSuccess: (signer) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.byId(signer.id) });
      queryClient.invalidateQueries({ queryKey: signerKeys.list(signer.projectId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.certificate(signer.id) });
      const stillPending = signer.status === SignerStatus.Pending;
      let text = "Issuance status updated";
      if (stillPending) {
        text = signer.externalOrder
          ? `Still pending. DigiCert order #${signer.externalOrder.orderId} is awaiting approval in DigiCert.`
          : "Issuance still pending. Checked just now.";
      }
      createNotification({
        text,
        type: stillPending ? "info" : "success"
      });
    }
  });
};

export const useAddSignerUserMembers = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, object, TAddSignerUserMembersDTO>({
    mutationFn: async ({ signerId, ...body }) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/signers/${signerId}/users`,
        body
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "user") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      createNotification({ text: "Members added", type: "success" });
    }
  });
};

export const useUpdateSignerUserRole = () => {
  const queryClient = useQueryClient();

  return useMutation<{ membership: TSignerMember }, object, TUpdateSignerUserRoleDTO>({
    mutationFn: async ({ signerId, userId, role }) => {
      const { data } = await apiRequest.patch<{ membership: TSignerMember }>(
        `/api/v1/cert-manager/signers/${signerId}/users/${userId}`,
        { role }
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "user") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      createNotification({ text: "Role updated", type: "success" });
    }
  });
};

export const useRemoveSignerUserMember = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, object, TRemoveSignerUserDTO>({
    mutationFn: async ({ signerId, userId }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/cert-manager/signers/${signerId}/users/${userId}`
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "user") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      createNotification({ text: "Member removed", type: "success" });
    }
  });
};

export const useAddSignerIdentityMember = () => {
  const queryClient = useQueryClient();

  return useMutation<TSignerMember, object, TAddSignerIdentityMemberDTO>({
    mutationFn: async ({ signerId, identityId, role }) => {
      const { data } = await apiRequest.post<TSignerMember>(
        `/api/v1/cert-manager/signers/${signerId}/identities`,
        { identityId, role }
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "identity") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
    }
  });
};

export const useUpdateSignerIdentityRole = () => {
  const queryClient = useQueryClient();

  return useMutation<{ membership: TSignerMember }, object, TUpdateSignerIdentityRoleDTO>({
    mutationFn: async ({ signerId, identityId, role }) => {
      const { data } = await apiRequest.patch<{ membership: TSignerMember }>(
        `/api/v1/cert-manager/signers/${signerId}/identities/${identityId}`,
        { role }
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "identity") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      createNotification({ text: "Role updated", type: "success" });
    }
  });
};

export const useRemoveSignerIdentityMember = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, object, TRemoveSignerIdentityDTO>({
    mutationFn: async ({ signerId, identityId }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/cert-manager/signers/${signerId}/identities/${identityId}`
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "identity") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      createNotification({ text: "Member removed", type: "success" });
    }
  });
};

export const useAddSignerGroupMember = () => {
  const queryClient = useQueryClient();

  return useMutation<TSignerMember, object, TAddSignerGroupMemberDTO>({
    mutationFn: async ({ signerId, groupId, role }) => {
      const { data } = await apiRequest.post<TSignerMember>(
        `/api/v1/cert-manager/signers/${signerId}/groups`,
        { groupId, role }
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "group") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
    }
  });
};

export const useUpdateSignerGroupRole = () => {
  const queryClient = useQueryClient();

  return useMutation<{ membership: TSignerMember }, object, TUpdateSignerGroupRoleDTO>({
    mutationFn: async ({ signerId, groupId, role }) => {
      const { data } = await apiRequest.patch<{ membership: TSignerMember }>(
        `/api/v1/cert-manager/signers/${signerId}/groups/${groupId}`,
        { role }
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "group") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      createNotification({ text: "Role updated", type: "success" });
    }
  });
};

export const useRemoveSignerGroupMember = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, object, TRemoveSignerGroupDTO>({
    mutationFn: async ({ signerId, groupId }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/cert-manager/signers/${signerId}/groups/${groupId}`
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.members(signerId, "group") });
      queryClient.invalidateQueries({ queryKey: signerKeys.effectiveMembersAll(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      createNotification({ text: "Member removed", type: "success" });
    }
  });
};

export const useUpdateSignerPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation<TSignerPolicy, object, TUpdateSignerPolicyDTO>({
    mutationFn: async ({ signerId, ...body }) => {
      const { data } = await apiRequest.put<TSignerPolicy>(
        `/api/v1/cert-manager/signers/${signerId}/approval-policy`,
        body
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.policy(signerId) });
      queryClient.invalidateQueries({ queryKey: signerKeys.byId(signerId) });
      createNotification({ text: "Approval policy updated", type: "success" });
    }
  });
};

export const useRequestToSign = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, object, TRequestToSignDTO>({
    mutationFn: async ({ signerId, ...body }) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/signers/${signerId}/requests`,
        body
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.requests(signerId) });
      queryClient.invalidateQueries({ queryKey: approvalRequestQuery.allKey() });
      createNotification({ text: "Signing request submitted", type: "success" });
    }
  });
};

export const usePreApproveSigning = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, object, TPreApproveSigningDTO>({
    mutationFn: async ({ signerId, ...body }) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/signers/${signerId}/requests/pre-approve`,
        body
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.requests(signerId) });
      queryClient.invalidateQueries({ queryKey: approvalRequestQuery.allKey() });
      createNotification({ text: "Signing pre-approved", type: "success" });
    }
  });
};

export const useRevokeSignerRequest = () => {
  const queryClient = useQueryClient();

  return useMutation<unknown, object, TRevokeSignerRequestDTO>({
    mutationFn: async ({ signerId, requestId }) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/signers/${signerId}/requests/${requestId}/revoke`
      );
      return data;
    },
    onSuccess: (_, { signerId }) => {
      queryClient.invalidateQueries({ queryKey: signerKeys.requests(signerId) });
      queryClient.invalidateQueries({ queryKey: approvalRequestQuery.allKey() });
      createNotification({ text: "Request revoked", type: "success" });
    }
  });
};
