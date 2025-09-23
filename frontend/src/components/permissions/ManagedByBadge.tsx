import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Badge, Tooltip } from "../v2";
import { faBuilding } from "@fortawesome/free-regular-svg-icons";

type Props = {
  namespaceId?: string | null;
};

export const ManagedByBadge = ({ namespaceId }: Props) => {
  if (namespaceId) {
    return (
      <Tooltip content="This resource belongs to your namespace.">
        <div className="ml-2 mr-auto">
          <Badge className="flex h-5 w-min items-center gap-1 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300 hover:text-bunker-300">
            <FontAwesomeIcon icon={faBuilding} size="sm" />
            Namespace
          </Badge>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="This resource belongs to your organization.">
      <div className="ml-2 mr-auto">
        <Badge className="flex h-5 w-min items-center gap-1 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300 hover:text-bunker-300">
          <FontAwesomeIcon icon={faBuilding} size="sm" />
          Organization
        </Badge>
      </div>
    </Tooltip>
  );
};
