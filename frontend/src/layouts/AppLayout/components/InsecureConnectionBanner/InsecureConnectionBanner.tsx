import { useState } from "react";
import { faWarning, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton } from "@app/components/v2";

export const InsecureConnectionBanner = () => {
  const [isAcknowledged, setIsAcknowledged] = useState(
    localStorage.getItem("insecureConnectionAcknowledged") ?? false
  );

  const handleDismiss = () => {
    setIsAcknowledged(true);
    localStorage.setItem("insecureConnectionAcknowledged", "true");
  };

  if (isAcknowledged) return null;

  return (
    <div className="sticky top-0 z-50 flex w-full items-start bg-red-700 py-1 px-2 font-inter text-sm text-mineshaft-200">
      <FontAwesomeIcon className="mt-1" icon={faWarning} />
      <span className="mx-1 mt-[0.04rem]">
        Your connection to this Infisical instance is not secured via HTTPS. Some features may not
        behave as expected.
      </span>
      <IconButton
        size="xs"
        className="ml-auto"
        colorSchema="danger"
        onClick={handleDismiss}
        ariaLabel="Dismiss banner"
      >
        <FontAwesomeIcon icon={faX} />
      </IconButton>
    </div>
  );
};
