import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input } from "@app/components/v2";
import { useCreateUserSecret, useUpdateUserSecret } from "@app/hooks/api/userSecrets/mutations";

import { type FormProps } from "./types";

const createCreditCardSchema = z.object({
  name: z.string().min(1, "Name is required"),
  cardNumber: z.string().min(1, "Card number is required"),
  expiryDate: z.string().optional(),
  cvv: z.string().optional(),
  id: z.string().optional()
});

type FormSchema = z.infer<typeof createCreditCardSchema>;

export const CreditCardForm = ({ userId, onSubmit, defaultValues }: FormProps<FormSchema>) => {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors }
  } = useForm<FormSchema>({
    resolver: zodResolver(createCreditCardSchema),
    defaultValues: defaultValues || {
      name: "",
      cardNumber: "",
      expiryDate: "",
      cvv: ""
    }
  });

  const createUserSecret = useCreateUserSecret();
  const updateUserSecret = useUpdateUserSecret();

  return (
    <div className="flex flex-col">
      <form
        onSubmit={handleSubmit(async (data) => {
          if (data.id) {
            await updateUserSecret.mutateAsync({
              userId,
              userSecretId: data.id,
              userSecret: {
                type: "creditCard",
                ...data
              }
            });
          } else {
            await createUserSecret.mutateAsync({
              userId,
              userSecret: { type: "creditCard", ...data }
            });
          }

          onSubmit();
        })}
      >
        <FormControl
          label="Name"
          isError={Boolean(errors?.name)}
          errorText={errors?.name?.message}
          isRequired
        >
          <Input {...register("name")} />
        </FormControl>

        <FormControl
          label="Card Number"
          isError={Boolean(errors?.cardNumber)}
          errorText={errors?.cardNumber?.message}
          isRequired
        >
          <Input {...register("cardNumber")} />
        </FormControl>

        <FormControl
          label="Expiry Date"
          isError={Boolean(errors?.expiryDate)}
          errorText={errors?.expiryDate?.message}
        >
          <Input {...register("expiryDate")} />
        </FormControl>

        <FormControl label="CVV" isError={Boolean(errors?.cvv)} errorText={errors?.cvv?.message}>
          <Input {...register("cvv")} />
        </FormControl>

        <input type="hidden" {...register("id")} />

        <Button type="submit" isLoading={isSubmitting} isFullWidth>
          {defaultValues ? "Edit" : "Create"} Credit Card
        </Button>
      </form>
    </div>
  );
};
