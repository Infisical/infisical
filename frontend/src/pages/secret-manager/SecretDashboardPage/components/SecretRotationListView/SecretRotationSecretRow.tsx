import { twMerge } from "tailwind-merge";

import { SecretInput, Tooltip } from "@app/components/v2";
import { Blur } from "@app/components/v2/Blur";
import { useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

interface SecretRotationSecretRowProps {
  secret: TSecretRotationV2["secrets"][number];
  secretPath: string;
  environment: string;
}

export const SecretRotationSecretRow = ({
  secret,
  environment,
  secretPath
}: SecretRotationSecretRowProps) => {
  const [isFieldFocused, setIsFieldFocused] = useToggle();

  const { currentProject } = useProject();

  const { data: secretValue, isPending: isLoadingSecretValue } = useGetSecretValue(
    {
      environment,
      secretPath,
      secretKey: secret?.key ?? "",
      projectId: currentProject.id
    },
    {
      enabled: isFieldFocused && Boolean(secret)
    }
  );

  const getValue = () => {
    if (isLoadingSecretValue) return HIDDEN_SECRET_VALUE;

    if (!secretValue) return "Error loading secret value";

    return secretValue.value || "";
  };

  return (
    <Tooltip
      className="max-w-sm"
      content={secret ? undefined : "You do not have permission to view this secret."}
    >
      <tr className="h-full last:!border-b-0 hover:bg-mineshaft-700">
        <td className="flex h-full items-center" style={{ padding: "0.5rem 1rem" }}>
          <span className={twMerge(!secret && "blur")}>{secret?.key ?? "********"}</span>
        </td>
        <td className="col-span-2 h-full w-full" style={{ padding: "0.5rem 1rem" }}>
          {/* eslint-disable-next-line no-nested-ternary */}
          {!secret ? (
            <div className="h-full pl-4 blur">********</div>
          ) : secret.secretValueHidden ? (
            <Blur
              className="py-0"
              tooltipText="You do not have permission to read the value of this secret."
            />
          ) : (
            <SecretInput
              isReadOnly
              value={getValue()}
              onFocus={() => setIsFieldFocused.on()}
              onBlur={() => setIsFieldFocused.off()}
            />
          )}
        </td>
      </tr>
    </Tooltip>
  );
};
