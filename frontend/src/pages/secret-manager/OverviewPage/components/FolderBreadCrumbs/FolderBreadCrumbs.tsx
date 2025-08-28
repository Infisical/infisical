import { faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip
} from "@app/components/v2";

type Props = {
  secretPath: string;
  onResetSearch: (path: string) => void;
};

export const FolderBreadCrumbs = ({ secretPath = "/", onResetSearch }: Props) => {
  const navigate = useNavigate({
    from: "/projects/secret-management/$projectId/overview"
  });

  const onFolderCrumbClick = (index: number) => {
    const newSecPath = `/${secretPath.split("/").filter(Boolean).slice(0, index).join("/")}`;
    if (secretPath === newSecPath) return;
    navigate({
      search: (prev) => ({ ...prev, secretPath: newSecPath })
    }).then(() => onResetSearch(newSecPath));
  };

  const getFolderPathArrowComponent = (
    path: string,
    index: number,
    arr: string[],
    isIntermediate: boolean
  ) => {
    return (
      <div
        key={`secret-path-${index + 1}`}
        className={`breadcrumb relative z-20 ${
          index + 1 === arr.length ? "cursor-default" : "cursor-pointer"
        } border-solid border-mineshaft-600 py-1 pl-5 pr-2 text-sm text-mineshaft-200`}
        onClick={() => onFolderCrumbClick(index + 1)}
        onKeyDown={() => null}
        role="button"
        tabIndex={0}
      >
        <Tooltip
          position="top"
          className="max-w-sm p-2"
          content={path}
          isDisabled={!(path.length > 40) || isIntermediate}
        >
          <div>
            {isIntermediate ? path : path.substring(0, 40)}
            {path.length > 40 && !isIntermediate ? "..." : ""}
          </div>
        </Tooltip>
      </div>
    );
  };

  const folderPaths = (secretPath || "")
    .split("/")
    .filter(Boolean)
    .map((path, index, arr) => ({
      path,
      index,
      arr
    }));
  const lastFolders = folderPaths
    .slice(-2)
    .map((item) => getFolderPathArrowComponent(item.path, item.index, item.arr, false));
  const intermediateFolders = folderPaths.length > 2 ? folderPaths.slice(0, -2) : [];
  const intermediateFoldersComponent = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          key="secret-path-intermediate"
          className="breadcrumb relative z-20 cursor-pointer border-solid border-mineshaft-600 py-1 pl-5 pr-2 text-sm text-mineshaft-200"
          role="button"
          tabIndex={0}
        >
          ...
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="-ml-2 max-w-[100vh] overflow-x-auto p-2 pr-2 no-scrollbar"
        side="bottom"
        sideOffset={12}
        align="start"
        style={{ zIndex: 999 }}
      >
        <div className="data-[highlighted]:bg-bunker-800">
          <div className="flex w-max flex-row gap-2 pr-3">
            {intermediateFolders.map((item) =>
              getFolderPathArrowComponent(item.path, item.index, item.arr, true)
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const filteredFolders =
    folderPaths.length > 2 ? [intermediateFoldersComponent].concat(lastFolders) : lastFolders;

  return (
    <div className="flex items-center space-x-2">
      <div
        className="breadcrumb relative z-20 border-solid border-mineshaft-600 bg-mineshaft-800 py-1 pl-5 pr-2 text-sm hover:bg-mineshaft-600"
        onClick={() => onFolderCrumbClick(0)}
        onKeyDown={() => null}
        role="button"
        tabIndex={0}
      >
        <FontAwesomeIcon icon={faFolderOpen} className="text-primary-700" />
      </div>
      {filteredFolders}
    </div>
  );
};
