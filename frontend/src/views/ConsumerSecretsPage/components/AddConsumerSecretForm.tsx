import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  Select,
  SelectItem,
  TextArea,
} from "@app/components/v2";
import {useAddConsumerSecret} from "@app/hooks/api/consumerSecrets"
import { ConsumerSecretType, ConsumerSecretTypeUnion } from "@app/hooks/api/consumerSecrets/types";

// Define the schema for form validation using Zod
const schema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["web_login", "credit_card", "private_note"]),
  url: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  cardNumber: z.string().optional(),
  nameOnCard: z.string().optional(),
  validThrough: z.string().optional(),
  cvv: z.string().optional(),
  noteTitle: z.string().optional(),
  noteDescription: z.string().optional(),
});

export type FormData = z.infer<typeof schema>;

export const AddConsumerSecretForm = () => {
  const [secretType, setSecretType] = useState<string>("credit_card");
  const createConsumerSecret = useAddConsumerSecret();

  const toastOnSecretCreationSuccess = () => toast("Secret added successfully!", {
    autoClose: 3000,
    position: "bottom-right",
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    progress: undefined,
    theme: "dark",
  })

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      type: "credit_card",
    },
  });
  
    type TCreateConsumerSecretDTO = {
        name: string;
        data: ConsumerSecretTypeUnion;
    };
      
    const generateMutationRequestPayload = (data: FormData): TCreateConsumerSecretDTO => {
        let payloadData: ConsumerSecretTypeUnion;
      
        switch (data.type) {
          case ConsumerSecretType.WebLogin:
            payloadData = {
              type: ConsumerSecretType.WebLogin,
              url: data.url || "",
              username: data.username || "",
              password: data.password || ""
            };
            break;
      
          case ConsumerSecretType.CreditCard:
            payloadData = {
              type: ConsumerSecretType.CreditCard,
              nameOnCard: data.nameOnCard || "",
              cardNumber: data.cardNumber || "",
              validThrough: data.validThrough || "",
              cvv: data.cvv || ""
            };
            break;
      
          case ConsumerSecretType.PrivateNote:
            payloadData = {
              type: ConsumerSecretType.PrivateNote,
              title: data.noteTitle || "",
              content: data.noteDescription || ""
            };
            break;
      
          default:
            throw new Error("Invalid type");
        }
      
        return {
          name: data.name,
          data: payloadData 
        };
    };

    const onFormSubmit = async (data: FormData) => {
        const payload = generateMutationRequestPayload(data);
      
        console.log(payload);
      
        await createConsumerSecret.mutateAsync(payload);
      
        toastOnSecretCreationSuccess();
    };
      

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <FormControl label="Name" isError={Boolean(errors.name)} errorText={errors.name?.message} isRequired>
            <Input {...field} placeholder="Name" type="text" />
          </FormControl>
        )}
      />

      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <FormControl className="w-full" label="Type" isError={Boolean(errors.type)} errorText={errors.type?.message} isRequired>
            <Select className="w-full" {...field} onValueChange={(e) => {
              field.onChange(e);
              setSecretType(e);
            }}>
              <SelectItem value="web_login">Login Credentials</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="private_note">Private Note</SelectItem>
            </Select>
          </FormControl>
        )}
      />

      {secretType === "web_login" && (
        <>
          <Controller
            control={control}
            name="url"
            render={({ field }) => (
              <FormControl label="URL" isError={Boolean(errors.url)} errorText={errors.url?.message} isRequired>
                <Input {...field} placeholder="URL" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="username"
            render={({ field }) => (
              <FormControl label="Username" isError={Boolean(errors.username)} errorText={errors.username?.message} isRequired>
                <Input {...field} placeholder="Username" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <FormControl label="Password" isError={Boolean(errors.password)} errorText={errors.password?.message} isRequired>
                <Input {...field} placeholder="Password" type="password" />
              </FormControl>
            )}
          />
        </>
      )}

      {secretType === "credit_card" && (
        <>
          <Controller
            control={control}
            name="cardNumber"
            render={({ field }) => (
              <FormControl label="Card Number" isError={Boolean(errors.cardNumber)} errorText={errors.cardNumber?.message} isRequired>
                <Input {...field} placeholder="Card Number" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="nameOnCard"
            render={({ field }) => (
              <FormControl label="Name on Card" isError={Boolean(errors.nameOnCard)} errorText={errors.nameOnCard?.message} isRequired>
                <Input {...field} placeholder="Name on Card" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="validThrough"
            render={({ field }) => (
              <FormControl label="Valid Through" isError={Boolean(errors.validThrough)} errorText={errors.validThrough?.message} isRequired>
                <Input {...field} placeholder="MM/YY" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="cvv"
            render={({ field }) => (
              <FormControl label="CVV" isError={Boolean(errors.cvv)} errorText={errors.cvv?.message} isRequired>
                <Input {...field} placeholder="CVV" type="text" />
              </FormControl>
            )}
          />
        </>
      )}

      {secretType === "private_note" && (
        <>
          <Controller
            control={control}
            name="noteTitle"
            render={({ field }) => (
              <FormControl label="Note Title" isError={Boolean(errors.noteTitle)} errorText={errors.noteTitle?.message} isRequired>
                <Input {...field} placeholder="Note Title" type="text" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="noteDescription"
            render={({ field }) => (
              <FormControl label="Note Description" isError={Boolean(errors.noteDescription)} errorText={errors.noteDescription?.message} isRequired>
                <TextArea {...field} placeholder="Note Description" />
              </FormControl>
            )}
          />
        </>
      )}

      <Button className="mt-4" size="sm" type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
        Submit
      </Button>
    </form>
  );
};
