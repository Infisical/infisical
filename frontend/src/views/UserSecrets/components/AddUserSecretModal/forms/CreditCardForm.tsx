import { Control, Controller } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { UserSecretFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<UserSecretFormData>;
};

export const CreditCardForm = ({ control }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="Card Number">
      <Controller
        control={control}
        name="data.cardNumber"
        rules={{ required: "Card number is required" }}
        render={({ field, fieldState: { error } }) => (
          <Input 
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
          name="data.expiryDate"
          rules={{ required: "Expiry date is required" }}
          render={({ field, fieldState: { error } }) => (
            <Input 
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
          name="data.cvv"
          rules={{ required: "CVV is required" }}
          render={({ field, fieldState: { error } }) => (
            <Input 
              {...field} 
              type="password"
              placeholder="123"
              isError={Boolean(error)}
            />
          )}
        />
      </FormControl>
    </div>
  </>
); 