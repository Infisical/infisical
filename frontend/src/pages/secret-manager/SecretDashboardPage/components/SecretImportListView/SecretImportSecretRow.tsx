import { SecretInput } from "@app/components/v2";
import { useProject } from "@app/context";
import { useToggle } from "@app/hooks";
import { useGetSecretValue } from "@app/hooks/api/dashboard/queries";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

type SecretImportSecretRowProps = {
  secret: {
    key: string;
    value?: string;
    environment: string;
    secretPath?: string;
    isEmpty?: boolean;
    overridden: { env: string; secretPath: string };
  };
};

export const SecretImportSecretRow = ({
  secret: { key, environment, secretPath = "/", isEmpty }
}: SecretImportSecretRowProps) => {
  const [isFieldFocused, setIsFieldFocused] = useToggle();

  const { currentProject } = useProject();

  const canFetchSecretValue = !isEmpty;

  const {
    data: secretValue,
    isPending: isPendingSecretValue,
    isError: isErrorFetchingSecretValue
  } = useGetSecretValue(
    {
      environment,
      secretPath,
      secretKey: key,
      projectId: currentProject.id
    },
    {
      enabled: isFieldFocused && canFetchSecretValue
    }
  );

  const isLoadingSecretValue = canFetchSecretValue && isPendingSecretValue;

  const getValue = () => {
    if (isLoadingSecretValue) return HIDDEN_SECRET_VALUE;

    if (isErrorFetchingSecretValue) return "Error loading secret value";

    return secretValue?.value || "";
  };

  return (
    <tr>
      <td className="h-10 w-1/2" style={{ padding: "0.25rem 1rem" }}>
        {key}
      </td>
      <td className="h-10 w-1/2" style={{ padding: "0.25rem 1rem" }}>
        <SecretInput
          value={getValue()}
          onFocus={() => setIsFieldFocused.on()}
          onBlur={() => setIsFieldFocused.off()}
          isReadOnly
        />
      </td>
    </tr>
  );
};
