import { components, OptionProps } from "react-select";
import { CheckIcon, PlusIcon } from "lucide-react";

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
      {isCreateOption ? (
        <div className="flex cursor-pointer flex-row items-center gap-x-1.5 text-muted">
          <PlusIcon className="size-4 shrink-0" />
          <span>Add Certificate Policy</span>
        </div>
      ) : (
        <div className="flex cursor-pointer flex-row items-center justify-between">
          <p className="truncate">{children}</p>
          {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
        </div>
      )}
    </components.Option>
  );
};
