import { FolderUpIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { RowLink, TableCell, TableRow } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";

type Props = {
  secretPath: string;
  isNavigationDisabled: boolean;
  environments: { name: string; slug: string }[];
  onClick: (parentPath: string) => void;
};

export const ParentFolderTableRow = ({
  secretPath,
  isNavigationDisabled,
  environments,
  onClick
}: Props) => {
  const isSingleEnvView = environments.length === 1;
  const parentPath = `/${secretPath.split("/").filter(Boolean).slice(0, -1).join("/")}`;

  return (
    <TableRow linked className="group hover:z-10">
      <TableCell
        className={twMerge(
          "w-10 max-w-10 min-w-10 p-0",
          !isSingleEnvView &&
            "sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover"
        )}
      >
        <div className="flex h-full items-center justify-center">
          <FolderUpIcon className="size-4 text-folder" />
        </div>
      </TableCell>
      <TableCell
        colSpan={isSingleEnvView ? 2 : undefined}
        className={twMerge(
          !isSingleEnvView &&
            "sticky left-10 z-10 border-r bg-container transition-all duration-75 group-hover:bg-container-hover"
        )}
      >
        <RowLink
          disabled={isNavigationDisabled}
          from={ROUTE_PATHS.SecretManager.OverviewPage.path}
          to="."
          search={(prev) => ({
            ...prev,
            secretPath: parentPath,
            environments: environments.map(({ slug }) => slug)
          })}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            onClick(parentPath);
          }}
          aria-label="Parent folder"
          title={parentPath}
        >
          ..
        </RowLink>
      </TableCell>
      {!isSingleEnvView &&
        environments.map(({ slug }) => (
          <TableCell key={`parent-folder-${slug}`} className="border-r last:border-r-0" />
        ))}
    </TableRow>
  );
};
