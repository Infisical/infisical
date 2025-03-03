import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const SecretRequestErrorContainer = () => {
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8">
      <div className="text-center">
        <FontAwesomeIcon icon={faKey} size="2x" />
        <p className="mt-4">The secret request you are looking for is missing or has expired.</p>
      </div>
    </div>
  );
};
