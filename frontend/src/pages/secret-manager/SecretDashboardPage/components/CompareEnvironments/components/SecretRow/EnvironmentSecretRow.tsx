import { faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Tooltip } from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";

type Props = {
  defaultValue?: string | null;
  isOverride?: boolean;
  isVisible?: boolean;
  isImportedSecret: boolean;
  environment: string;
  secretValueHidden: boolean;
  secretPath: string;
};

export const EnvironmentSecretRow = ({
  defaultValue,
  isOverride,
  isImportedSecret,
  secretValueHidden,
  environment,
  secretPath,
  isVisible
}: Props) => {
  return (
    <div className="group flex w-full cursor-text items-center space-x-2">
      {secretValueHidden && !isOverride && (
        <Tooltip content="You do not have access to view the current value">
          <FontAwesomeIcon className="pl-2" size="sm" icon={faEyeSlash} />
        </Tooltip>
      )}
      <div className="flex-1 pr-2 pl-3">
        <InfisicalSecretInput
          onChange={() => {}}
          isReadOnly
          value={defaultValue as string}
          key="secret-input"
          isVisible={isVisible && !secretValueHidden}
          secretPath={secretPath}
          environment={environment}
          isImport={isImportedSecret}
          defaultValue={secretValueHidden ? "" : undefined}
          canEditButNotView={secretValueHidden && !isOverride}
        />
      </div>
    </div>
  );
};
