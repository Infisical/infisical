import { useEffect, useState } from "react";
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
import { useCreateTokenIdentityTokenAuth, useUpdateIdentityTokenAuthToken } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z
  .object({
    name: z.string()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["token"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["token"]>, state?: boolean) => void;
};

export const IdentityTokenModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { mutateAsync: createToken } = useCreateTokenIdentityTokenAuth();
  const { mutateAsync: updateToken } = useUpdateIdentityTokenAuthToken();
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
      name: ""
    }
  });

  const tokenData = popUp?.token?.data as {
    identityId: string;
    tokenId?: string;
    name?: string;
  };

  useEffect(() => {
    if (tokenData?.tokenId && tokenData?.name) {
      reset({
        name: tokenData.name
      });
    } else {
      reset({
        name: ""
      });
    }
  }, [popUp?.token?.data]);

  const handleOpenChange = (isOpen: boolean) => {
    handlePopUpToggle("token", isOpen);
    if (!isOpen) {
      reset();
      setToken("");
    }
  };

  const onFormSubmit = async ({ name }: FormData) => {
    if (tokenData?.tokenId) {
      await updateToken({
        identityId: tokenData.identityId,
        tokenId: tokenData.tokenId,
        name
      });

      handlePopUpToggle("token", false);
    } else {
      const newTokenData = await createToken({
        identityId: tokenData.identityId,
        name
      });

      setToken(newTokenData.accessToken);
    }

    createNotification({
      text: `Successfully ${popUp?.token?.data ? "updated" : "created"} token`,
      type: "success"
    });

    reset();
  };

  const isUpdate = Boolean(tokenData?.tokenId);

  return (
    <Dialog open={popUp?.token?.isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isUpdate ? "Update Access Token" : "Create Access Token"}</DialogTitle>
          {hasToken && <DialogDescription>We will only show this token once</DialogDescription>}
        </DialogHeader>
        {!hasToken ? (
          <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-4">
            <Controller
              control={control}
              defaultValue=""
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel htmlFor="token-name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="token-name"
                    placeholder="My Token"
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
                {isUpdate ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <>
            <ButtonGroup className="w-full">
              <Input value={token} readOnly aria-label="Access token" className="font-mono" />
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
