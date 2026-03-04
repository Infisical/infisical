import { twMerge } from "tailwind-merge";

import { SecretInput, Tooltip } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";
import { useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

interface SecretOverviewRotationSecretRowProps {
  secret: SecretV3RawSanitized | null;
  isSecretVisible: boolean;
  environment: string;
  secretPath: string;
}

export const SecretOverviewRotationSecretRow = ({
  secret,
  isSecretVisible,
  environment,
  secretPath
}: SecretOverviewRotationSecretRowProps) => {
  const [isFieldFocused, setIsFieldFocused] = useToggle();

  const { currentProject } = useProject();

  const canFetchValue = Boolean(secret);

  const { data: secretValueData, isError } = useGetSecretValue(
    {
      secretKey: secret?.key ?? "",
      environment,
      secretPath,
      projectId: currentProject.id
    },
    {
      enabled: canFetchValue && (isSecretVisible || isFieldFocused)
    }
  );

  const secretValue = isError
    ? "Error loading secret value..."
    : (secretValueData?.valueOverride ?? secretValueData?.value ?? HIDDEN_SECRET_VALUE);

  return (
    <Tooltip
      className="max-w-sm"
      content={secret ? undefined : "You do not have permission to view this secret."}
    >
      <tr className="!last:border-b-0 h-full hover:bg-mineshaft-700">
        <td className="flex h-full items-center" style={{ padding: "0.5rem 1rem" }}>
          <span className={twMerge(!secret && "blur-sm")}>{secret?.key ?? "********"}</span>
        </td>
        <td className="col-span-2 h-full w-full" style={{ padding: "0.5rem 1rem" }}>
          {/* eslint-disable-next-line no-nested-ternary */}
          {!secret ? (
            <div className="h-full pl-4 blur-sm">********</div>
          ) : secret.secretValueHidden ? (
            <Blur
              className="py-0"
              tooltipText="You do not have permission to read the value of this secret."
            />
          ) : (
            <SecretInput
              isReadOnly
              value={secretValue}
              isVisible={isSecretVisible}
              onFocus={() => setIsFieldFocused.on()}
              onBlur={() => setIsFieldFocused.off()}
            />
          )}
        </td>
      </tr>
    </Tooltip>
  );
};
