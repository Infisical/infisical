import type {
  TAppConnection,
  TAvailableAppConnection,
  TCreateAppConnectionDTO
} from "@app/hooks/api/appConnections/types";
import type {
  TClearEnrollmentMethodDTO,
  TPkiApplicationEnrollmentState,
  TRevealAcmeEabSecretResponse,
  TSetAcmeEnrollmentDTO,
  TSetApiEnrollmentDTO,
  TSetEstEnrollmentDTO,
  TSetScepEnrollmentDTO
} from "@app/hooks/api/pkiApplications/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type EnrollmentPlan = { est: boolean; scep: boolean };

export type PkiApplicationsEnrollmentAdapter = {
  useEnrollment: (
    applicationId: string,
    profileId: string
  ) => V4QueryResult<TPkiApplicationEnrollmentState>;
  useEnrollmentPlan: (orgId: string) => V4QueryResult<EnrollmentPlan>;
  useSetApiEnrollment: V4Mutation<TSetApiEnrollmentDTO>;
  useClearApiEnrollment: V4Mutation<TClearEnrollmentMethodDTO>;
  useSetEstEnrollment: V4Mutation<TSetEstEnrollmentDTO>;
  useClearEstEnrollment: V4Mutation<TClearEnrollmentMethodDTO>;
  useSetAcmeEnrollment: V4Mutation<TSetAcmeEnrollmentDTO>;
  useClearAcmeEnrollment: V4Mutation<TClearEnrollmentMethodDTO>;
  useRevealAcmeEabSecret: V4Mutation<TClearEnrollmentMethodDTO, TRevealAcmeEabSecretResponse>;
  useRotateAcmeEabSecret: V4Mutation<TClearEnrollmentMethodDTO>;
  useSetScepEnrollment: V4Mutation<TSetScepEnrollmentDTO>;
  useClearScepEnrollment: V4Mutation<TClearEnrollmentMethodDTO>;
  useIntuneConnections: (
    projectId: string,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TAvailableAppConnection[]>;
  useCreateIntuneConnection: V4Mutation<TCreateAppConnectionDTO, TAppConnection>;
};
