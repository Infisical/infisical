import { useState } from "react";
import { faWarning, faXmark } from "@fortawesome/free-solid-svg-icons";
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
    <div className="flex w-screen items-start border-b border-red-900 bg-red-700 px-2 py-1 font-inter text-sm text-mineshaft-200">
      <FontAwesomeIcon className="ml-3.5 mt-1" icon={faWarning} />
      <span className="mx-1 ml-2 mt-[0.04rem]">
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
        <FontAwesomeIcon icon={faXmark} />
      </IconButton>
    </div>
  );
};
