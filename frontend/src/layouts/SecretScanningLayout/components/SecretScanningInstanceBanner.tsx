import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { useGetSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2";

export const SecretScanningInstanceBanner = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const { currentOrg } = useOrganization();
  const { data, isPending } = useGetSecretScanningInstanceState(currentOrg.id);

  if (isPending || !data || !data.isMultiInstance || !data.activeProjectId) return null;

  const isViewingActive = data.activeProjectId === projectId;

  return (
    <div className="flex w-full items-start gap-x-2 border-b border-warning/50 bg-warning/30 px-4 py-2 text-sm text-warning">
      <FontAwesomeIcon icon={faWarning} className="mt-0.5 shrink-0 text-base text-warning" />
      {isViewingActive ? (
        <p>
          This is your organization&apos;s active Secret Scanning project, the most recently
          created one. Use this for all work going forward.{" "}
          <Link
            to="/organizations/$orgId/settings"
            params={{ orgId: currentOrg.id }}
            search={{ selectedTab: "product-settings" }}
            className="underline underline-offset-2 hover:text-warning"
          >
            View all projects
          </Link>
        </p>
      ) : (
        <p>
          You&apos;re viewing a Secret Scanning project that isn&apos;t your organization&apos;s
          active project.{" "}
          <Link
            to="/organizations/$orgId/projects/secret-scanning/$projectId/data-sources"
            params={{ orgId: currentOrg.id, projectId: data.activeProjectId }}
            className="underline underline-offset-2 hover:text-warning"
          >
            Switch to your active project →
          </Link>
        </p>
      )}
    </div>
  );
};
