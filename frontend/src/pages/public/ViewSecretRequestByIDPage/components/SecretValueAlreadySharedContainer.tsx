import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const SecretValueAlreadySharedContainer = () => {
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8">
      <div className="text-center">
        <div className="mx-auto w-min rounded-md border border-mineshaft-800 bg-mineshaft-600 p-3">
          <FontAwesomeIcon icon={faKey} size="2x" className="text-primary-500" />
        </div>
        <p className="text-md mt-2 font-semibold">Secret Already Shared</p>
        <p className="mt-2 text-sm text-mineshaft-300">
          A secret value has already been shared for this secret request.
        </p>
      </div>
    </div>
  );
};
