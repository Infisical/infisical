import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, NoticeBanner, PageHeader, Pagination } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useServerConfig
} from "@app/context";
import { withPermission } from "@app/hoc";
import { usePagination, usePopUp } from "@app/hooks";
import {
  useCreateNewInstallationSession,
  useGetSecretScanningInstallationStatus,
  useGetSecretScanningRisks,
  useLinkGitAppInstallationWithOrg
} from "@app/hooks/api/secretScanning";
import { SecretScanningOrderBy } from "@app/hooks/api/secretScanning/types";

import { ExportSecretScansModal } from "./components/ExportSecretScansModal";
import { SecretScanningFilter } from "./components/SecretScanningFilters";
import { SecretScanningFilterFormData, secretScanningFilterFormSchema } from "./components/types";
import { SecretScanningLogsTable } from "./components";

const PER_PAGE_INIT = 25;

export const SecretScanningPage = withPermission(
  () => {
    const queryParams = useSearch({
      from: ROUTE_PATHS.Organization.SecretScanning.id
    });

    const navigate = useNavigate();

    const { control, watch } = useForm<SecretScanningFilterFormData>({
      resolver: zodResolver(secretScanningFilterFormSchema),
      defaultValues: {}
    });

    const { config } = useServerConfig();
    const { currentOrg } = useOrganization();
    const organizationId = currentOrg.id;

    const { offset, limit, orderBy, setPage, perPage, page, setPerPage } = usePagination(
      SecretScanningOrderBy.CreatedAt,
      { initPerPage: PER_PAGE_INIT }
    );

    const repositoryNames = watch("repositoryNames");
    const resolvedStatus = watch("resolved");

    const { isPending, data: risksData } = useGetSecretScanningRisks(
      organizationId,
      {
        offset,
        limit,
        orderBy
      },
      {
        repositoryNames:
          repositoryNames?.length > 0 ? repositoryNames.map((repo) => repo.name) : undefined,
        resolvedStatus
      }
    );

    const { mutateAsync: linkGitAppInstallationWithOrganization } =
      useLinkGitAppInstallationWithOrg();
    const { mutateAsync: createNewIntegrationSession } = useCreateNewInstallationSession();
    const {
      data: installationStatus,
      isPending: isSecretScanningInstatllationStatusLoading,
      refetch: refetchSecretScanningInstallationStatus
    } = useGetSecretScanningInstallationStatus(organizationId);
    const integrationEnabled =
      !isSecretScanningInstatllationStatusLoading && installationStatus?.appInstallationCompleted;

    const { handlePopUpToggle, popUp } = usePopUp(["exportSecretScans"]);

    useEffect(() => {
      const linkInstallation = async () => {
        if (queryParams.state && queryParams.installation_id) {
          try {
            const isLinked = await linkGitAppInstallationWithOrganization({
              installationId: String(queryParams.installation_id),
              sessionId: String(queryParams.state)
            });
            if (isLinked) {
              await navigate({
                to: "/organization/secret-scanning"
              });
              refetchSecretScanningInstallationStatus();
            }

            console.log("installation verification complete");
          } catch (e) {
            console.log("app installation is stale, start new session", e);
          }
        }
      };
      linkInstallation();
    }, [queryParams.state, queryParams.installation_id]);

    const generateNewIntegrationSession = async () => {
      const session = await createNewIntegrationSession({ organizationId });
      window.location.href = `https://github.com/apps/${session.gitAppSlug}/installations/new?state=${session.sessionId}`;
    };

    return (
      <div className="py-2">
        <Helmet>
          <title>Secret scanning</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
          <div className="w-full max-w-7xl">
            <PageHeader
              title="Secret Scanning"
              description="Automatically monitor your GitHub activity and prevent secret leaks"
            />
            {config.isSecretScanningDisabled && (
              <NoticeBanner title="Secret scanning is in maintenance" className="mb-4">
                We are working on improving the performance of secret scanning due to increased
                usage.
              </NoticeBanner>
            )}
            <div className="relative mb-6 flex justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-6">
              <div className="flex flex-col items-start">
                <div className="mb-1 flex flex-row">
                  Secret Scanning Status:{" "}
                  {integrationEnabled ? (
                    <p className="ml-1.5 font-semibold text-green">Enabled</p>
                  ) : (
                    <p className="ml-1.5 font-semibold text-red">Not enabled</p>
                  )}
                </div>
                <div>
                  {integrationEnabled ? (
                    <p className="text-mineshaft-300">
                      Your GitHub organization is connected to Infisical, and is being continuously
                      monitored for secret leaks.
                    </p>
                  ) : (
                    <p className="text-mineshaft-300">
                      Connect your GitHub organization to Infisical.
                    </p>
                  )}
                </div>
              </div>
              {integrationEnabled ? (
                <div>
                  <div className="absolute right-[2.5rem] top-[2.5rem] flex h-6 w-6 animate-ping items-center justify-center rounded-full bg-green" />
                  <div className="absolute right-[2.63rem] top-[2.63rem] flex h-5 w-5 animate-ping items-center justify-center rounded-full bg-green" />
                  <div className="absolute right-[2.82rem] top-[2.82rem] flex h-3.5 w-3.5 animate-ping items-center justify-center rounded-full bg-green" />
                </div>
              ) : (
                <div className="flex h-[3.25rem] items-center">
                  <OrgPermissionCan
                    I={OrgPermissionActions.Create}
                    a={OrgPermissionSubjects.SecretScanning}
                  >
                    {(isAllowed) => (
                      <Button
                        variant="solid"
                        colorSchema="primary"
                        onClick={generateNewIntegrationSession}
                        className="h-min py-2"
                        isDisabled={!isAllowed}
                      >
                        Integrate with GitHub
                      </Button>
                    )}
                  </OrgPermissionCan>
                </div>
              )}
            </div>
            <div className="mt-8 space-y-3">
              {integrationEnabled && (
                <div className="flex w-full items-center justify-end">
                  <SecretScanningFilter
                    repositories={risksData?.repos || []}
                    handlePopUpToggle={handlePopUpToggle}
                    control={control}
                  />
                </div>
              )}
              <SecretScanningLogsTable gitRisks={risksData?.risks} isPending={isPending} />
              {!isPending &&
                risksData?.totalCount !== undefined &&
                risksData.totalCount >= PER_PAGE_INIT && (
                  <Pagination
                    className="rounded-md"
                    count={risksData.totalCount}
                    page={page}
                    perPage={perPage}
                    onChangePage={(newPage) => setPage(newPage)}
                    onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
                  />
                )}
            </div>
          </div>
        </div>
        <ExportSecretScansModal
          repositories={risksData?.repos || []}
          handlePopUpToggle={handlePopUpToggle}
          popUp={popUp}
        />
      </div>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.SecretScanning
  }
);
