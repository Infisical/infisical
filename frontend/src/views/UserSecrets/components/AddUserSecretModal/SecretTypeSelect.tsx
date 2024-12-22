import { Control, Controller } from "react-hook-form";
import { faCreditCard, faGlobe, faNotdef } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Select, SelectItem } from "@app/components/v2";
import { CreateUserSecretDTO, UserSecretType } from "@app/hooks/api/userSecrets";


type Props = {
  control: Control<CreateUserSecretDTO>;
};

const secretTypeOptions = [
  { value: UserSecretType.WEB_LOGIN, label: "Web Login", icon: faGlobe },
  { value: UserSecretType.CREDIT_CARD, label: "Credit Card", icon: faCreditCard },
  { value: UserSecretType.SECURE_NOTE, label: "Secure Note", icon: faNotdef }
];

export const SecretTypeSelect = ({ control }: Props) => (
  <FormControl label="Secret Type">
    <Controller
      control={control}
      name="type"
      render={({ field }) => (
        <Select {...field}>
          {secretTypeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={option.icon} />
                {option.label}
              </div>
            </SelectItem>
          ))}
        </Select>
      )}
    />
  </FormControl>
); 