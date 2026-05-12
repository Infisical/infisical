import { components, OptionProps } from "react-select";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export type CaOption =
  | { id: string; name: string; groupType?: string }
  | { id: "_create"; name: string };

export const CertificateAuthorityOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<CaOption>) => {
  const isCreateOption = props.data.id === "_create";

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex items-center">
        {isCreateOption ? (
          <div className="flex items-center gap-x-1 text-mineshaft-400">
            <FontAwesomeIcon icon={faPlus} size="sm" />
            <span>Create New CA</span>
          </div>
        ) : (
          <p className="mr-auto truncate">{children}</p>
        )}
      </div>
    </components.Option>
  );
};
