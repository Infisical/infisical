import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { useTimedReset } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { createNotification } from "../notifications";
import { IconButton, Tooltip } from "../v2";

type Props = {
  secretPathSegments: string[];
  selectedPathSegmentIndex: number;
  environmentSlug: string;
  projectId: string;
};

export const SecretDashboardPathBreadcrumb = ({
  secretPathSegments,
  selectedPathSegmentIndex,
  environmentSlug,
  projectId
}: Props) => {
  const [, isCopying, setIsCopying] = useTimedReset({
    initialState: false
  });

  const newSecretPath = `/${secretPathSegments.slice(0, selectedPathSegmentIndex + 1).join("/")}`;
  const isLastItem = secretPathSegments.length === selectedPathSegmentIndex + 1;
  const folderName = secretPathSegments.at(selectedPathSegmentIndex);

  return (
    <div className="flex items-center space-x-3">
      {isLastItem ? (
        <div className="group flex items-center space-x-2">
          <span
            className={twMerge(
              "text-sm font-semibold transition-all",
              isCopying ? "text-bunker-200" : "text-bunker-300"
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
              className="opacity-0 transition duration-75 hover:bg-bunker-100/10 group-hover:opacity-100"
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
          to={`/${ProjectType.SecretManager}/$projectId/secrets/$envSlug` as const}
          params={{
            projectId,
            envSlug: environmentSlug
          }}
          search={(query) => ({ ...query, secretPath: newSecretPath })}
          className={twMerge(
            "text-sm font-semibold transition-all hover:text-primary",
            isCopying && "text-primary"
          )}
        >
          {folderName}
        </Link>
      )}
    </div>
  );
};
