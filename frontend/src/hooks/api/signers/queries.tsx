import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { SignerPermissionSet } from "@app/context/SignerPermissionContext/types";
import { ResourcePermissionResponse } from "@app/helpers/resourcePermissions";

import {
  SignerStatus,
  TGetPublicKeyResponse,
  TGetUserSignerPermissionDTO,
  TListEffectiveSignerMembersDTO,
  TListEffectiveSignerMembersResponse,
  TListSignerMembersDTO,
  TListSignerMembersResponse,
  TListSignerRequestsDTO,
  TListSignerRequestsResponse,
  TListSignersDTO,
  TListSignersResponse,
  TListSigningOperationsDTO,
  TListSigningOperationsResponse,
  TSigner,
  TSignerPolicy
} from "./types";

const SIGNER_LIST_POLL_MS = 4000;
const SIGNER_DETAIL_POLL_MS = 3000;

export const signerKeys = {
  all: ["signers"] as const,
  list: (projectId: string) => [...signerKeys.all, "list", projectId] as const,
  listWithOpts: (filters: TListSignersDTO) =>
    [...signerKeys.list(filters.projectId), filters] as const,
  byId: (signerId: string) => [...signerKeys.all, "detail", signerId] as const,
  publicKey: (signerId: string) => [...signerKeys.all, "publicKey", signerId] as const,
  operations: (signerId: string) => [...signerKeys.all, "operations", signerId] as const,
  operationsWithOpts: (filters: TListSigningOperationsDTO) =>
    [...signerKeys.operations(filters.signerId), filters] as const,
  members: (signerId: string, kind: string) =>
    [...signerKeys.all, "members", signerId, kind] as const,
  effectiveMembers: (signerId: string, kind: "user" | "identity") =>
    [...signerKeys.all, "effective-members", signerId, kind] as const,
  effectiveMembersAll: (signerId: string) =>
    [...signerKeys.all, "effective-members", signerId] as const,
  policy: (signerId: string) => [...signerKeys.all, "policy", signerId] as const,
  requestsAll: () => [...signerKeys.all, "requests"] as const,
  requests: (signerId: string) => [...signerKeys.requestsAll(), signerId] as const,
  requestsWithOpts: (filters: TListSignerRequestsDTO) =>
    [...signerKeys.requests(filters.signerId), filters] as const,
  certificate: (signerId: string) => [...signerKeys.all, "certificate", signerId] as const,
  getUserSignerPermissions: ({ signerId }: TGetUserSignerPermissionDTO) =>
    ["user-signer-permissions", { signerId }] as const
};

export const fetchUserSignerPermissions = async ({ signerId }: TGetUserSignerPermissionDTO) => {
  const { data } = await apiRequest.get<{
    data: ResourcePermissionResponse<SignerPermissionSet>;
  }>(`/api/v1/cert-manager/signers/${signerId}/permissions`);

  return data.data;
};

export const useListSigners = (dto: TListSignersDTO) => {
  return useQuery({
    queryKey: signerKeys.listWithOpts(dto),
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId: dto.projectId,
        offset: String(dto.offset ?? 0),
        limit: String(dto.limit ?? 25)
      });
      if (dto.search) params.set("search", dto.search);

      const { data } = await apiRequest.get<TListSignersResponse>(
        `/api/v1/cert-manager/signers?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(dto.projectId),
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) =>
      query.state.data?.signers?.some((s) => s.status === SignerStatus.Pending)
        ? SIGNER_LIST_POLL_MS
        : false
  });
};

export const useGetSigner = (signerId: string) => {
  return useQuery({
    queryKey: signerKeys.byId(signerId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSigner>(`/api/v1/cert-manager/signers/${signerId}`);
      return data;
    },
    enabled: Boolean(signerId),
    refetchInterval: (query) =>
      query.state.data?.status === SignerStatus.Pending ? SIGNER_DETAIL_POLL_MS : false
  });
};

export const useGetSignerPublicKey = (signerId: string) => {
  return useQuery({
    queryKey: signerKeys.publicKey(signerId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetPublicKeyResponse>(
        `/api/v1/cert-manager/signers/${signerId}/public-key`
      );
      return data;
    },
    enabled: Boolean(signerId)
  });
};

export const useListSigningOperations = (dto: TListSigningOperationsDTO) => {
  return useQuery({
    queryKey: signerKeys.operationsWithOpts(dto),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(dto.offset ?? 0),
        limit: String(dto.limit ?? 25)
      });
      if (dto.status) params.set("status", dto.status);

      const { data } = await apiRequest.get<TListSigningOperationsResponse>(
        `/api/v1/cert-manager/signers/${dto.signerId}/operations?${params.toString()}`
      );
      return data;
    },
    enabled: Boolean(dto.signerId),
    placeholderData: (previousData) => previousData
  });
};

const memberPathSegment = (kind: "user" | "identity" | "group") => {
  if (kind === "user") return "users";
  if (kind === "identity") return "identities";
  return "groups";
};

export const useListSignerMembers = (dto: TListSignerMembersDTO) => {
  return useQuery({
    queryKey: signerKeys.members(dto.signerId, dto.kind),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSignerMembersResponse>(
        `/api/v1/cert-manager/signers/${dto.signerId}/${memberPathSegment(dto.kind)}`
      );
      return data;
    },
    enabled: Boolean(dto.signerId)
  });
};

export const useListEffectiveSignerMembers = (dto: TListEffectiveSignerMembersDTO) => {
  const segment = dto.kind === "user" ? "effective-users" : "effective-identities";
  return useQuery({
    queryKey: signerKeys.effectiveMembers(dto.signerId, dto.kind),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListEffectiveSignerMembersResponse>(
        `/api/v1/cert-manager/signers/${dto.signerId}/${segment}`
      );
      return data;
    },
    enabled: Boolean(dto.signerId)
  });
};

export const useGetSignerPolicy = (signerId: string) => {
  return useQuery({
    queryKey: signerKeys.policy(signerId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSignerPolicy>(
        `/api/v1/cert-manager/signers/${signerId}/approval-policy`
      );
      return data;
    },
    enabled: Boolean(signerId)
  });
};

export const useListSignerRequests = (dto: TListSignerRequestsDTO) => {
  return useQuery({
    queryKey: signerKeys.requestsWithOpts(dto),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dto.statuses?.length) params.set("statuses", dto.statuses.join(","));
      if (dto.offset !== undefined) params.set("offset", String(dto.offset));
      if (dto.limit !== undefined) params.set("limit", String(dto.limit));
      const url = params.toString()
        ? `/api/v1/cert-manager/signers/${dto.signerId}/requests?${params.toString()}`
        : `/api/v1/cert-manager/signers/${dto.signerId}/requests`;
      const { data } = await apiRequest.get<TListSignerRequestsResponse>(url);
      return data;
    },
    enabled: Boolean(dto.signerId),
    placeholderData: (previousData) => previousData
  });
};

export const useExportSignerCertificate = (signerId: string, enabled = false) => {
  return useQuery({
    queryKey: signerKeys.certificate(signerId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificatePem: string;
        serialNumber: string;
        signerName: string;
      }>(`/api/v1/cert-manager/signers/${signerId}/certificate`);
      return data;
    },
    enabled: enabled && Boolean(signerId)
  });
};
