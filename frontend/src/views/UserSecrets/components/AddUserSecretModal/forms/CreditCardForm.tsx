import { Control, Controller } from "react-hook-form";

import { FormControl } from "@app/components/v2";
import { SecretField } from "@app/components/v2/SecretField";
import { CreditCardFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<CreditCardFormData>;
};

export const CreditCardForm = ({ control }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="Card Number">
      <Controller
        control={control}
        name="data.data.cardNumber"
        rules={{ required: "Card number is required" }}
        render={({ field, fieldState: { error } }) => (
          <SecretField 
            {...field} 
            placeholder="1234 5678 9012 3456"
            isError={Boolean(error)}
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
            <SecretField 
              {...field} 
              placeholder="MM/YY"
              isError={Boolean(error)}
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
            <SecretField 
              {...field} 
              placeholder="123"
              isError={Boolean(error)}
            />
          )}
        />
      </FormControl>
    </div>
  </>
); 