import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheck, Copy } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input
} from "@app/components/v3";
import { useScopeVariant, useTimedReset } from "@app/hooks";
import { useCreateIdentityUniversalAuthClientSecret } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    description: z.string(),
    ttl: z.string().refine((val) => Number(val) <= 315360000, {
      message: "TTL cannot be greater than 315360000"
    }),
    numUsesLimit: z.string()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["clientSecret"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["clientSecret"]>, state?: boolean) => void;
};

export const IdentityClientSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { mutateAsync: createClientSecret } = useCreateIdentityUniversalAuthClientSecret();
  const scopeVariant = useScopeVariant();
  const [token, setToken] = useState("");
  const [, isCopyingToken, setCopyTextToken] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });
  const hasToken = Boolean(token);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: "",
      ttl: "",
      numUsesLimit: ""
    }
  });

  const popUpData = popUp?.clientSecret?.data as {
    identityId: string;
  };

  const handleOpenChange = (isOpen: boolean) => {
    handlePopUpToggle("clientSecret", isOpen);
    if (!isOpen) {
      reset();
      setToken("");
    }
  };

  const onFormSubmit = async ({ description, ttl, numUsesLimit }: FormData) => {
    const { clientSecret } = await createClientSecret({
      identityId: popUpData.identityId,
      description,
      ttl: Number(ttl),
      numUsesLimit: Number(numUsesLimit)
    });

    setToken(clientSecret);

    createNotification({
      text: "Successfully created client secret",
      type: "success"
    });

    reset();
  };

  return (
    <Dialog open={popUp?.clientSecret?.isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create Client Secret</DialogTitle>
          {hasToken && <DialogDescription>We will only show this secret once</DialogDescription>}
        </DialogHeader>
        {!hasToken ? (
          <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
            <Controller
              control={control}
              defaultValue=""
              name="description"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="client-secret-description">Description</FieldLabel>
                  <Input
                    {...field}
                    id="client-secret-description"
                    placeholder="My Client Secret"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="ttl"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="client-secret-ttl">TTL (seconds) - optional</FieldLabel>
                  <Input
                    {...field}
                    id="client-secret-ttl"
                    placeholder="0"
                    type="number"
                    min="0"
                    step="1"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="numUsesLimit"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="client-secret-num-uses-limit">Max Number of Uses</FieldLabel>
                  <Input
                    {...field}
                    id="client-secret-num-uses-limit"
                    placeholder="0"
                    type="number"
                    min="0"
                    step="1"
                    isError={Boolean(error)}
                  />
                  <FieldError>{error?.message}</FieldError>
                </Field>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={scopeVariant}
                isPending={isSubmitting}
                isDisabled={isSubmitting}
              >
                Create
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <ButtonGroup className="w-full">
              <Input value={token} readOnly aria-label="Client secret" className="font-mono" />
              <IconButton
                variant="outline"
                aria-label="Copy to clipboard"
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  setCopyTextToken("Copied");
                }}
              >
                {isCopyingToken ? <ClipboardCheck /> : <Copy />}
              </IconButton>
            </ButtonGroup>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
