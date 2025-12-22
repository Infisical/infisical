import { faChevronRight, faFingerprint, faFolder } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { Td, Tooltip, Tr } from "@app/components/v2";
import { reverseTruncate } from "@app/helpers/reverseTruncate";
import { TDashboardProjectSecretsQuickSearch } from "@app/hooks/api/dashboard/types";

type Props = {
  dynamicSecretGroup: TDashboardProjectSecretsQuickSearch["dynamicSecrets"][string];
  onClose: () => void;
};

export const QuickSearchDynamicSecretItem = ({
  dynamicSecretGroup,

  onClose
}: Props) => {
  const navigate = useNavigate({
    from: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });

  const [groupDynamicSecret] = dynamicSecretGroup;

  const handleNavigate = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        secretPath: groupDynamicSecret.path,
        search: groupDynamicSecret.name
      })
    });
    onClose();
  };

  return (
    <Tr
      className="hover cursor-pointer bg-mineshaft-700 hover:bg-mineshaft-600"
      onClick={handleNavigate}
    >
      <Td className="w-full">
        <div className="inline-flex max-w-[20rem] flex-col">
          <span className="truncate">
            <FontAwesomeIcon className="mr-2 self-center text-yellow-700" icon={faFingerprint} />
            {groupDynamicSecret.name}
          </span>
          <span className="text-xs text-mineshaft-400">
            <FontAwesomeIcon size="xs" className="mr-0.5 text-yellow-700" icon={faFolder} />{" "}
            <Tooltip className="max-w-8xl" content={groupDynamicSecret.path}>
              <span>{reverseTruncate(groupDynamicSecret.path)}</span>
            </Tooltip>
          </span>
        </div>
      </Td>
      <Td />
      <Td>
        <FontAwesomeIcon icon={faChevronRight} />
      </Td>
    </Tr>
  );
};
