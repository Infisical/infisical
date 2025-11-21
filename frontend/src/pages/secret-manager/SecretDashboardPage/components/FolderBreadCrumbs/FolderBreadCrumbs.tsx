import { faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

type Props = {
  secretPath: string;
};

export const FolderBreadCrumbs = ({ secretPath = "/" }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
  });

  const onFolderCrumbClick = (index: number) => {
    const newSecPath = `/${secretPath.split("/").filter(Boolean).slice(0, index).join("/")}`;
    if (secretPath === newSecPath) return;
    navigate({
      search: (prev) => ({ ...prev, secretPath: newSecPath })
    });
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-3">
      <div
        className="breadcrumb relative z-20 border-solid border-mineshaft-600 bg-mineshaft-800 py-1 pr-2 pl-5 text-sm hover:bg-mineshaft-600"
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
            } border-solid border-mineshaft-600 py-1 pr-2 pl-5 text-sm text-mineshaft-200`}
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
