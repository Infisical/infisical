import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const SecretValueAlreadySharedContainer = () => {
  return (
    <div className="border-mineshaft-600 bg-mineshaft-800 rounded-lg border p-8">
      <div className="text-center">
        <div className="border-mineshaft-800 bg-mineshaft-600 mx-auto w-min rounded-md border p-3">
          <FontAwesomeIcon icon={faKey} size="2x" className="text-primary-500" />
        </div>
        <p className="text-md mt-2 font-medium">Secret Already Shared</p>
        <p className="text-mineshaft-300 mt-2 text-sm">
          A secret value has already been shared for this secret request.
        </p>
      </div>
    </div>
  );
};
