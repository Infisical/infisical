import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const SecretErrorContainer = () => {
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8">
      <div className="text-center">
        <FontAwesomeIcon icon={faKey} size="2x" />
        <p className="mt-4">The secret you are looking is missing or has expired</p>
      </div>
    </div>
  );
};
