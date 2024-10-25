import { useRouter } from "next/router";
import { faChevronRight, faFolder } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Td, Tooltip, Tr } from "@app/components/v2";
import { reverseTruncate } from "@app/helpers/reverseTruncate";
import { TDashboardProjectSecretsQuickSearch } from "@app/hooks/api/dashboard/types";

type Props = {
  folderGroup: TDashboardProjectSecretsQuickSearch["folders"][string];
  onClose: () => void;
};

export const QuickSearchFolderItem = ({ folderGroup, onClose }: Props) => {
  const router = useRouter();

  const [groupFolder] = folderGroup;

  const handleNavigate = () => {
    router.push({
      pathname: window.location.pathname,
      query: {
        secretPath: groupFolder.path
      }
    });
    onClose();
  };

  return (
    <Tr
      className="hover cursor-pointer bg-mineshaft-700 hover:bg-mineshaft-600"
      onClick={handleNavigate}
    >
      <Td className="w-full whitespace-nowrap">
        <FontAwesomeIcon className="text-yellow-700" icon={faFolder} />
        <Tooltip content={groupFolder.path} className="max-w-7xl">
          <div className="ml-2 inline-block">{reverseTruncate(groupFolder.path)}</div>
        </Tooltip>
      </Td>
      <Td />
      <Td>
        <FontAwesomeIcon icon={faChevronRight} />
      </Td>
    </Tr>
  );
};
