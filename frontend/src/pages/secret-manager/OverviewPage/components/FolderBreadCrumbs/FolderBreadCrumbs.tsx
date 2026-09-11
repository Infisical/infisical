import { faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

type Props = {
  secretPath: string;
  onResetSearch: (path: string) => void;
};

export const FolderBreadCrumbs = ({ secretPath = "/", onResetSearch }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const onFolderCrumbClick = (index: number) => {
    const newSecPath = `/${secretPath.split("/").filter(Boolean).slice(0, index).join("/")}`;
    if (secretPath === newSecPath) return;
    navigate({
      search: (prev) => ({ ...prev, secretPath: newSecPath })
    }).then(() => onResetSearch(newSecPath));
  };

  return (
    <div className="flex items-center space-x-2">
      <div
        className="breadcrumb relative z-20 border-solid border-border-control bg-surface-raised py-1 pr-2 pl-5 text-sm hover:bg-surface-active"
        onClick={() => onFolderCrumbClick(0)}
        onKeyDown={() => null}
        role="button"
        tabIndex={0}
      >
        <FontAwesomeIcon icon={faFolderOpen} className="text-project" />
      </div>
      {(secretPath || "")
        .split("/")
        .filter(Boolean)
        .map((path, index, arr) => (
          <div
            key={`secret-path-${index + 1}`}
            className={`breadcrumb relative z-20 ${
              index + 1 === arr.length ? "cursor-default" : "cursor-pointer"
            } border-solid border-border-control py-1 pr-2 pl-5 text-sm text-foreground-secondary`}
            onClick={() => onFolderCrumbClick(index + 1)}
            onKeyDown={() => null}
            role="button"
            tabIndex={0}
          >
            {path}
          </div>
        ))}
    </div>
  );
};
