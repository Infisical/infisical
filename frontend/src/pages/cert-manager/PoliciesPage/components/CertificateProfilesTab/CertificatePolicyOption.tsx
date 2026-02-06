import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";

type PolicyOptionData = TCertificatePolicy | { id: "_create"; name: string };

export const CertificatePolicyOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<PolicyOptionData>) => {
  const isCreateOption = props.data.id === "_create";

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex items-center">
        {isCreateOption ? (
          <div className="flex items-center gap-x-1 text-mineshaft-400">
            <FontAwesomeIcon icon={faPlus} size="sm" />
            <span>Add Certificate Policy</span>
          </div>
        ) : (
          <>
            <p className="mr-auto truncate">{children}</p>
            {isSelected && (
              <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
            )}
          </>
        )}
      </div>
    </components.Option>
  );
};
