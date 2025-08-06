import { faShield } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  lastLoggedInAuthMethod: string;
};

export const LastLoginSection = ({ lastLoggedInAuthMethod }: Props) => (
  <div>
    <div className="mb-2 flex items-center gap-2 border-b border-mineshaft-600 pb-1">
      <div className="font-medium">Last Login Details</div>
    </div>
    <div className="flex items-center gap-2 text-sm">
      <div className="rounded bg-mineshaft-700 p-1 px-2">
        <FontAwesomeIcon icon={faShield} />
      </div>
      <div className="flex flex-col">
        <div className="text-sm font-medium">Authentication Method</div>
        <div className="text-sm">{lastLoggedInAuthMethod}</div>
      </div>
    </div>
  </div>
);
