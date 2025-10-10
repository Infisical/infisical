import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  requesterUsername: string;
};

export const SecretRequestSuccessContainer = ({ requesterUsername }: Props) => {
  return (
    <div className="border-mineshaft-600 bg-mineshaft-800 rounded-lg border p-8">
      <div className="text-center">
        <div className="border-mineshaft-800 bg-mineshaft-600 mx-auto w-min rounded-md border p-3">
          <FontAwesomeIcon icon={faCheck} size="2x" className="text-primary-500" />
        </div>
        <p className="text-md mt-2 font-medium">Secret Shared</p>
        <p className="text-mineshaft-300 mt-2 text-sm">
          <strong>{requesterUsername}</strong> has now been notified of your shared secret, and will
          be able to access it shortly.
        </p>
      </div>
    </div>
  );
};
