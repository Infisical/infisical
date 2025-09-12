import { faClock, faShield } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

type Props = {
  lastLoginAuthMethod: string;
  lastLoginTime: string;
};

export const LastLoginSection = ({ lastLoginTime, lastLoginAuthMethod }: Props) => (
  <div>
    <div className="mb-2 flex items-center gap-2 border-b border-mineshaft-600 pb-1">
      <div className="font-medium">Last Login</div>
    </div>
    <div className="mb-2 flex items-center gap-2 text-sm">
      <div className="flex items-center justify-center rounded bg-mineshaft-700 p-3">
        <FontAwesomeIcon icon={faShield} className="h-4 w-4" />
      </div>
      <div className="flex flex-col">
        <div className="text-sm font-medium">Authentication Method</div>
        <div className="text-sm">{lastLoginAuthMethod}</div>
      </div>
    </div>
    <div className="flex items-center gap-2 text-sm">
      <div className="flex items-center justify-center rounded bg-mineshaft-700 p-3">
        <FontAwesomeIcon icon={faClock} className="h-4 w-4" />
      </div>
      <div className="flex flex-col">
        <div className="text-sm font-medium">Time</div>
        <div className="text-sm">{format(lastLoginTime, "PPpp")} </div>
      </div>
    </div>
  </div>
);
