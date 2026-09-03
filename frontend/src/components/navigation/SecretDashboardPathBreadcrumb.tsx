import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { useOrganization } from "@app/context";
import { useTimedReset } from "@app/hooks";

import { createNotification } from "../notifications";
import { IconButton, Tooltip } from "../v2";

type Props = {
  secretPathSegments: string[];
  selectedPathSegmentIndex: number;
  environmentSlug: string;
  projectId: string;
  disableCopy?: boolean;
};

export const SecretDashboardPathBreadcrumb = ({
  secretPathSegments,
  selectedPathSegmentIndex,
  environmentSlug,
  projectId,
  disableCopy
}: Props) => {
  const { currentOrg } = useOrganization();
  const [, isCopying, setIsCopying] = useTimedReset({
    initialState: false
  });

  const newSecretPath = `/${secretPathSegments.slice(0, selectedPathSegmentIndex + 1).join("/")}`;
  const isLastItem = secretPathSegments.length === selectedPathSegmentIndex + 1;
  const folderName = secretPathSegments.at(selectedPathSegmentIndex);

  return (
    <div className="flex items-center space-x-3">
      {isLastItem && !disableCopy ? (
        <div className="group flex items-center space-x-2">
          <span
            className={twMerge(
              "text-sm transition-all",
              isCopying ? "text-foreground" : "text-label"
            )}
          >
            {folderName}
          </span>
          <Tooltip className="relative right-2" position="bottom" content="Copy secret path">
            <IconButton
              variant="plain"
              ariaLabel="copy"
              onClick={() => {
                if (isCopying) return;
                setIsCopying(true);
                navigator.clipboard.writeText(newSecretPath);

                createNotification({
                  text: "Copied secret path to clipboard",
                  type: "info"
                });
              }}
              className="opacity-0 transition duration-75 group-hover:opacity-100 hover:bg-foreground/10"
            >
              <FontAwesomeIcon
                icon={!isCopying ? faCopy : faCheck}
                size="sm"
                className="cursor-pointer"
              />
            </IconButton>
          </Tooltip>
        </div>
      ) : (
        <Link
          to="/organizations/$orgId/projects/secret-management/$projectId/overview"
          params={{
            orgId: currentOrg.id,
            projectId
          }}
          search={(query) => ({
            ...query,
            secretPath: newSecretPath,
            environments: [environmentSlug]
          })}
          className={twMerge(
            "text-sm transition-all hover:text-project",
            isCopying && "text-project"
          )}
        >
          {folderName}
        </Link>
      )}
    </div>
  );
};
