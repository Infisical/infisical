import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useLdapConnectionListGroups } from "@app/hooks/api/appConnections/ldap/queries";
import { useCreateAppConnection } from "@app/hooks/api/appConnections/mutations";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useClearPkiApplicationAcmeEnrollment,
  useClearPkiApplicationApiEnrollment,
  useClearPkiApplicationEstEnrollment,
  useClearPkiApplicationMicrosoftAutoenrollmentEnrollment,
  useClearPkiApplicationScepEnrollment,
  useReenrollPkiApplicationMicrosoftAutoenrollmentComputers,
  useRevealPkiApplicationAcmeEabSecret,
  useRotatePkiApplicationAcmeEabSecret,
  useSetPkiApplicationAcmeEnrollment,
  useSetPkiApplicationApiEnrollment,
  useSetPkiApplicationEstEnrollment,
  useSetPkiApplicationMicrosoftAutoenrollmentEnrollment,
  useSetPkiApplicationScepEnrollment
} from "@app/hooks/api/pkiApplications/mutations";
import {
  useGetMicrosoftAutoenrollmentServicePrincipal,
  useGetPkiApplicationEnrollment
} from "@app/hooks/api/pkiApplications/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { PkiApplicationsEnrollmentAdapter } from "./contract-enrollment";

export const enrollmentLive: PkiApplicationsEnrollmentAdapter = {
  useEnrollment: useGetPkiApplicationEnrollment,
  useEnrollmentPlan: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return {
      data: data
        ? {
            est: Boolean(data.pkiEst),
            scep: Boolean(data.pkiScep),
            microsoftAutoenrollment: Boolean(data.pkiMicrosoftAutoenrollment)
          }
        : undefined,
      isPending,
      error
    };
  },
  useSetApiEnrollment: useSetPkiApplicationApiEnrollment,
  useClearApiEnrollment: useClearPkiApplicationApiEnrollment,
  useSetEstEnrollment: useSetPkiApplicationEstEnrollment,
  useClearEstEnrollment: useClearPkiApplicationEstEnrollment,
  useSetAcmeEnrollment: useSetPkiApplicationAcmeEnrollment,
  useClearAcmeEnrollment: useClearPkiApplicationAcmeEnrollment,
  useRevealAcmeEabSecret: useRevealPkiApplicationAcmeEabSecret,
  useRotateAcmeEabSecret: useRotatePkiApplicationAcmeEabSecret,
  useSetScepEnrollment: useSetPkiApplicationScepEnrollment,
  useClearScepEnrollment: useClearPkiApplicationScepEnrollment,
  useIntuneConnections: (projectId, options) =>
    useListAvailableAppConnections(AppConnection.MicrosoftIntune, projectId, options),
  useCreateIntuneConnection: useCreateAppConnection,
  useSetMicrosoftAutoenrollmentEnrollment: useSetPkiApplicationMicrosoftAutoenrollmentEnrollment,
  useClearMicrosoftAutoenrollmentEnrollment:
    useClearPkiApplicationMicrosoftAutoenrollmentEnrollment,
  useReenrollMicrosoftAutoenrollmentComputers:
    useReenrollPkiApplicationMicrosoftAutoenrollmentComputers,
  useMicrosoftAutoenrollmentServicePrincipal: useGetMicrosoftAutoenrollmentServicePrincipal,
  useLdapConnections: (projectId) => useListAvailableAppConnections(AppConnection.LDAP, projectId),
  useCreateLdapConnection: useCreateAppConnection,
  useLdapGroups: useLdapConnectionListGroups
};
