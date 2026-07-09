import { KeyIcon } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@app/components/v3";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  value?: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  placeholder?: string;
};

// Picks a secret key from the current folder. The key icon appears inside the dropdown
// options (to signal these are secret references) but not in the collapsed trigger.
export const SecretSelect = ({
  projectId,
  environment,
  secretPath,
  value,
  onChange,
  isDisabled,
  placeholder = "Select secret"
}: Props) => {
  const { data: secrets = [] } = useGetProjectSecrets({
    projectId,
    environment,
    secretPath,
    viewSecretValue: false
  });

  return (
    <Select value={value} onValueChange={onChange} disabled={isDisabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {secrets.map((secret) => (
          <SelectItem key={secret.key} value={secret.key}>
            <KeyIcon />
            {secret.key}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
