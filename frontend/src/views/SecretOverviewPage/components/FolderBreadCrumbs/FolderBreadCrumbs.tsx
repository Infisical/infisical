import { useRouter } from "next/router";
import { faEllipsis, faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FolderBreadCrumb } from "./FolderBreadCrumb";

type Props = {
  secretPath: string;
  onResetSearch: (path: string) => void;
  maxLength?: number;
};

export const FolderBreadCrumbs = ({ secretPath = "/", onResetSearch, maxLength = 2 }: Props) => {
  const router = useRouter();
  const pathList = (secretPath || "").split("/").filter(Boolean);

  const onFolderCrumbClick = (index: number) => {
    const newSecPath = `/${secretPath.split("/").filter(Boolean).slice(0, index).join("/")}`;
    if (secretPath === newSecPath) return;
    const query = { ...router.query, secretPath: newSecPath } as Record<string, string>;
    // root condition
    if (index === 0) delete query.secretPath;
    router
      .push({
        pathname: router.pathname,
        query
      })
      .then(() => onResetSearch(newSecPath));
  };

  const onBackCrumbClick = () => {
    onFolderCrumbClick(pathList.length - 1);
  };

  return (
    <div className="mb-1 flex items-end space-x-2">
      <div
        className="breadcrumb relative z-20 border-solid border-mineshaft-600 bg-mineshaft-800 py-1 pl-5 pr-2 text-sm hover:bg-mineshaft-600"
        onClick={() => onFolderCrumbClick(0)}
        onKeyDown={() => null}
        role="button"
        tabIndex={0}
      >
        <FontAwesomeIcon icon={faFolderOpen} className="text-primary-700" />
      </div>

      {pathList.length <= maxLength &&
        pathList.map((path, index) => (
          <FolderBreadCrumb
            key={`secret-path-${index + 1}`}
            onClick={() => onFolderCrumbClick(index + 1)}
            isLast={index === pathList.length - 1}
          >
            {path}
          </FolderBreadCrumb>
        ))}

      {pathList.length > maxLength && (
        <>
          <FolderBreadCrumb onClick={() => onFolderCrumbClick(1)}>{pathList[0]}</FolderBreadCrumb>
          <FolderBreadCrumb onClick={() => onBackCrumbClick()}>
            <FontAwesomeIcon icon={faEllipsis} className="text-primary-700" />
          </FolderBreadCrumb>
          <FolderBreadCrumb onClick={() => onFolderCrumbClick(pathList.length)} isLast>
            {pathList.at(-1)}
          </FolderBreadCrumb>
        </>
      )}
    </div>
  );
};
