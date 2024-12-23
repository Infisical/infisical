import { Control, Controller } from "react-hook-form";

import { FormControl } from "@app/components/v2";
import { HideableField } from "@app/components/v2/HideableField";
import { CreditCardFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<CreditCardFormData>;
  isEditing?: boolean;
};

export const CreditCardForm = ({ control, isEditing = false }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="Card Number">
      <Controller
        control={control}
        name="data.data.cardNumber"
        rules={{ required: "Card number is required" }}
        render={({ field, fieldState: { error } }) => (
          <HideableField 
            {...field} 
            placeholder="1234 5678 9012 3456"
            isError={Boolean(error)}
            isSecret={isEditing}
          />
        )}
      />
    </FormControl>
    <div className="grid grid-cols-2 gap-4">
      <FormControl label="Expiry Date">
        <Controller
          control={control}
          name="data.data.expiryDate"
          rules={{ required: "Expiry date is required" }}
          render={({ field, fieldState: { error } }) => (
            <HideableField 
              {...field} 
              placeholder="MM/YY"
              isError={Boolean(error)}
              isSecret={isEditing}
            />
          )}
        />
      </FormControl>
      <FormControl label="CVV">
        <Controller
          control={control}
          name="data.data.cvv"
          rules={{ required: "CVV is required" }}
          render={({ field, fieldState: { error } }) => (
            <HideableField 
              {...field} 
              placeholder="123"
              isError={Boolean(error)}
              isSecret={isEditing}
            />
          )}
        />
      </FormControl>
    </div>
  </>
); 