import { faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

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
      {(secretPath || "")
        .split("/")
        .filter(Boolean)
        .map((path, index, arr) => (
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
            {path}
          </div>
        ))}
    </div>
  );
};
