import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";
import { createSecretScanningSession, getInstallationStatus, linkGitAppInstallationWithOrganization } from "@app/hooks/api";
import { SecretScanningLogsTable } from "@app/views/SecretScanning/components";

export const INFISICAL_RADAR_GITHUB_URL = "https://github.com/apps/infisical-radar";

const SecretScanning = withPermission(
  () => {
    const router = useRouter();
    const queryParams = router.query;
    const [integrationEnabled, setIntegrationStatus] = useState(false);

    const linkInstallation = async () => {
      if (
        typeof queryParams.state === "string" &&
        typeof queryParams.installation_id === "string"
      ) {
        try {
          const isLinked = await linkGitAppInstallationWithOrganization(
            queryParams.installation_id as string,
            queryParams.state as string
          );
          if (isLinked) {
            router.reload();
          }

          console.log("installation verification complete");
        } catch (e) {
          console.log("app installation is stale, start a new session", e);
        }
      }
    };

    useEffect(() => {
      const fetchInstallationStatus = async () => {
        const status = await getInstallationStatus(String(localStorage.getItem("orgData.id")));
        setIntegrationStatus(status);
      };

      fetchInstallationStatus();
      linkInstallation();

    }, [queryParams.state, queryParams.installation_id]);

    const generateNewIntegrationSession = async () => {
      const sessionId = await createSecretScanningSession(String(localStorage.getItem("orgData.id")));
      router.push(
        `${INFISICAL_RADAR_GITHUB_URL}/installations/new?state=${sessionId}`
      );
    };

    return (
      <div>
        <Head>
          <title>Secret scanning</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
        </Head>
        <div className="flex justify-center bg-bunker-800 text-white w-full h-full">
          <div className="max-w-7xl px-6 w-full">
            <div className="mt-6 text-3xl font-semibold text-gray-200">Secret Scanning</div>
            <div className="mb-6 text-lg text-mineshaft-300">
              Automatically monitor your GitHub activity and prevent secret leaks
            </div>
            <div className="relative flex justify-between bg-mineshaft-800 border border-mineshaft-600 rounded-md p-6 mb-6">
              <div className="flex flex-col items-start">
                <div className="flex flex-row mb-1">
                  Secret Scanning Status:{" "}
                  {integrationEnabled ? (
                    <p className="text-green ml-1.5 font-semibold">Enabled</p>
                  ) : (
                    <p className="text-red ml-1.5 font-semibold">Not enabled</p>
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
                  <div className="absolute right-[2.5rem] top-[2.5rem] animate-ping rounded-full h-6 w-6 bg-green flex items-center justify-center" />
                  <div className="absolute right-[2.63rem] top-[2.63rem] animate-ping rounded-full h-5 w-5 bg-green flex items-center justify-center" />
                  <div className="absolute right-[2.82rem] top-[2.82rem] animate-ping rounded-full h-3.5 w-3.5 bg-green flex items-center justify-center" />
                </div>
              ) : (
                <div className="flex items-center h-[3.25rem]">
                  <OrgPermissionCan
                    I={OrgPermissionActions.Create}
                    a={OrgPermissionSubjects.SecretScanning}
                  >
                    {(isAllowed) => (
                      <Button
                        variant="solid"
                        colorSchema="primary"
                        onClick={generateNewIntegrationSession}
                        className="py-2 h-min"
                        isDisabled={!isAllowed}
                      >
                        Integrate with GitHub
                      </Button>
                    )}
                  </OrgPermissionCan>
                </div>
              )}
            </div>
            <SecretScanningLogsTable />
          </div>
        </div>
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.SecretScanning }
);

Object.assign(SecretScanning, { requireAuth: true });

export default SecretScanning;
