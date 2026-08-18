import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TBlastRadius,
  TExposureRankingEntry,
  TGetBlastRadiusDTO,
  TGetExposureRankingDTO,
  TRotationSimulation,
  TSimulateRotationDTO
} from "./types";

export const blastRadiusKeys = {
  all: () => ["blast-radius"] as const,
  bySecret: (dto: TGetBlastRadiusDTO) => [...blastRadiusKeys.all(), "secret", dto] as const,
  rotationSimulation: (dto: TSimulateRotationDTO) =>
    [...blastRadiusKeys.all(), "rotation-simulation", dto] as const,
  exposureRanking: (dto: TGetExposureRankingDTO) =>
    [...blastRadiusKeys.all(), "exposure-ranking", dto] as const
};

const buildParams = (dto: TGetBlastRadiusDTO) => ({
  projectId: dto.projectId,
  environment: dto.environment,
  secretPath: dto.secretPath,
  ...(dto.window ? { window: dto.window } : {}),
  ...(dto.include?.length ? { include: dto.include.join(",") } : {}),
  ...(dto.principalLimit ? { principalLimit: dto.principalLimit } : {}),
  ...(dto.principalOffset ? { principalOffset: dto.principalOffset } : {}),
  ...(dto.principalOrder ? { principalOrder: dto.principalOrder } : {}),
  ...(dto.principalAccess ? { principalAccess: dto.principalAccess } : {}),
  ...(dto.principalUsage ? { principalUsage: dto.principalUsage } : {})
});

export const useGetSecretBlastRadius = (
  dto: TGetBlastRadiusDTO,
  options?: Omit<
    UseQueryOptions<
      TBlastRadius,
      unknown,
      TBlastRadius,
      ReturnType<typeof blastRadiusKeys.bySecret>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: blastRadiusKeys.bySecret(dto),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ blastRadius: TBlastRadius }>(
        `/api/v1/secrets/${encodeURIComponent(dto.secretKey)}/blast-radius`,
        { params: buildParams(dto) }
      );

      return data.blastRadius;
    },
    enabled: Boolean(dto.projectId && dto.secretKey && dto.environment),
    ...options
  });

export const useSimulateSecretRotation = (
  dto: TSimulateRotationDTO,
  options?: Omit<
    UseQueryOptions<
      TRotationSimulation,
      unknown,
      TRotationSimulation,
      ReturnType<typeof blastRadiusKeys.rotationSimulation>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: blastRadiusKeys.rotationSimulation(dto),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ simulation: TRotationSimulation }>(
        `/api/v1/secrets/${encodeURIComponent(dto.secretKey)}/rotation-simulation`,
        {
          params: {
            projectId: dto.projectId,
            environment: dto.environment,
            secretPath: dto.secretPath,
            ...(dto.window ? { window: dto.window } : {})
          }
        }
      );

      return data.simulation;
    },
    ...options
  });

export const useGetSecretExposureRanking = (
  dto: TGetExposureRankingDTO,
  options?: Omit<
    UseQueryOptions<
      TExposureRankingEntry[],
      unknown,
      TExposureRankingEntry[],
      ReturnType<typeof blastRadiusKeys.exposureRanking>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: blastRadiusKeys.exposureRanking(dto),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ rankings: TExposureRankingEntry[] }>(
        "/api/v1/insights/secrets/exposure-ranking",
        {
          params: {
            projectId: dto.projectId,
            ...(dto.environment ? { environment: dto.environment } : {}),
            ...(dto.window ? { window: dto.window } : {}),
            ...(dto.limit ? { limit: dto.limit } : {})
          }
        }
      );

      return data.rankings;
    },
    ...options
  });
