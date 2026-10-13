import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { setSecretScanningActiveProjectCookie } from "@app/helpers/secretScanningActiveProject";
import { useImplicitProjectId } from "@app/hooks";
import { useGetSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2";

export const SecretScanningInstanceBanner = () => {
  const projectId = useImplicitProjectId();
  const { currentOrg } = useOrganization();
  const { data, isPending } = useGetSecretScanningInstanceState(currentOrg.id);

  if (isPending || !data || !data.isMultiInstance || !data.activeProjectId) return null;

  const { activeProjectId } = data;
  const isViewingActive = activeProjectId === projectId;

  return (
    <div className="flex w-full items-start gap-x-2 border-b border-warning/50 bg-warning/30 px-4 py-2 text-sm text-warning">
      <FontAwesomeIcon icon={faWarning} className="mt-0.5 shrink-0 text-base text-warning" />
      {isViewingActive ? (
        <p>
          Secret Scanning no longer uses projects. Your organization&apos;s earlier Secret Scanning
          projects are still available.{" "}
          <Link
            to="/organizations/$orgId/settings"
            params={{ orgId: currentOrg.id }}
            search={{ selectedTab: "product-settings" }}
            className="underline underline-offset-2 hover:text-warning"
          >
            View other projects
          </Link>
        </p>
      ) : (
        <p>
          You&apos;re viewing an earlier Secret Scanning project. Secret Scanning no longer uses
          projects, but this one stays available from the organization settings.{" "}
          <Link
            to="/organizations/$orgId/secret-scanning/data-sources"
            params={{ orgId: currentOrg.id }}
            onClick={() => setSecretScanningActiveProjectCookie(currentOrg.id, activeProjectId)}
            className="underline underline-offset-2 hover:text-warning"
          >
            Go to Secret Scanning →
          </Link>
        </p>
      )}
    </div>
  );
};
