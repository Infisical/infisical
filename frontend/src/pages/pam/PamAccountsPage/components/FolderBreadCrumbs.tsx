import { faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

type Props = {
  path: string;
};

export const FolderBreadCrumbs = ({ path = "/" }: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/pam/$projectId/accounts"
  });

  const onFolderCrumbClick = (index: number) => {
    let newAccountPath = `/${path.split("/").filter(Boolean).slice(0, index).join("/")}`;

    if (!newAccountPath.endsWith("/")) {
      newAccountPath += "/";
    }

    if (path === newAccountPath) return;
    navigate({
      search: (prev) => ({ ...prev, accountPath: newAccountPath })
    });
  };

  return (
    <div className="flex items-center space-x-2">
      <div
        className="breadcrumb relative z-20 border-solid border-mineshaft-600 bg-mineshaft-800 py-1 pr-2 pl-5 text-sm hover:bg-mineshaft-600"
        onClick={() => onFolderCrumbClick(0)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onFolderCrumbClick(0);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <FontAwesomeIcon icon={faFolderOpen} className="text-primary-700" />
      </div>
      {(path || "")
        .split("/")
        .filter(Boolean)
        .map((pathSegment, index, arr) => (
          <div
            key={`path-${index + 1}`}
            className={`breadcrumb relative z-20 ${
              index + 1 === arr.length ? "cursor-default" : "cursor-pointer"
            } border-solid border-mineshaft-600 py-1 pr-2 pl-5 text-sm text-mineshaft-200`}
            onClick={() => onFolderCrumbClick(index + 1)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onFolderCrumbClick(index + 1);
              }
            }}
            role="button"
            tabIndex={0}
          >
            {pathSegment}
          </div>
        ))}
    </div>
  );
};
