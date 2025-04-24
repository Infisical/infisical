import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type Props = {
  requesterUsername: string;
};

export const SecretRequestSuccessContainer = ({ requesterUsername }: Props) => {
  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8">
      <div className="text-center">
        <div className="mx-auto w-min rounded-md border border-mineshaft-800 bg-mineshaft-600 p-3">
          <FontAwesomeIcon icon={faCheck} size="2x" className="text-primary-500" />
        </div>
        <p className="text-md mt-2 font-semibold">Secret Shared</p>
        <p className="mt-2 text-sm text-mineshaft-300">
          <strong>{requesterUsername}</strong> has now been notified of your shared secret, and will
          be able to access it shortly.
        </p>
      </div>
    </div>
  );
};
