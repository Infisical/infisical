import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";

export const CertManagerInstanceBanner = () => {
  const params = useParams({ strict: false }) as { projectId?: string };
  const { projectId } = params;
  const { currentOrg } = useOrganization();
  const { data, isPending } = useCertManagerInstanceState();

  if (isPending || !data || !data.isMultiInstance) return null;

  const activeProject = data.projects.find((p) => p.id === data.activeProjectId);
  const isViewingActive = activeProject?.id === projectId;

  return (
    <div className="flex w-full items-start gap-x-2 border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="mt-0.5 shrink-0 text-base text-yellow" />
      {isViewingActive ? (
        <p>
          This is your organization&apos;s active project. Use this for all work going forward.{" "}
          <Link
            to="/organizations/$orgId/settings"
            params={{ orgId: currentOrg.id }}
            search={{ selectedTab: "product-settings" }}
            className="underline underline-offset-2 hover:text-yellow"
          >
            Manage projects
          </Link>
        </p>
      ) : (
        <p>
          You&apos;re viewing a legacy Certificate Manager project.{" "}
          {activeProject ? (
            <Link
              to="/organizations/$orgId/projects/cert-manager/$projectId/overview"
              params={{ orgId: currentOrg.id, projectId: activeProject.id }}
              className="underline underline-offset-2 hover:text-yellow"
            >
              Switch to your active project →
            </Link>
          ) : (
            <a
              href="https://infisical.com/docs/documentation/platform/pki/migration"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-yellow"
            >
              Migration guide
            </a>
          )}
        </p>
      )}
    </div>
  );
};
