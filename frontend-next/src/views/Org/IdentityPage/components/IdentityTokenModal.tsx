import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
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
  const [token, setToken] = useState("");
  const [copyTextToken, isCopyingToken, setCopyTextToken] = useTimedReset<string>({
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

  const onFormSubmit = async ({ name }: FormData) => {
    try {
      if (tokenData?.tokenId) {
        // update

        await updateToken({
          identityId: tokenData.identityId,
          tokenId: tokenData.tokenId,
          name
        });

        handlePopUpToggle("token", false);
      } else {
        // create

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
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text =
        error?.response?.data?.message ??
        `Failed to ${popUp?.token?.data ? "update" : "create"} token`;

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.token?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("token", isOpen);
        reset();
        setToken("");
      }}
    >
      <ModalContent
        title={`${tokenData?.tokenId ? "Update" : "Create"} Access Token`}
        subTitle={hasToken ? "We will only show this token once" : ""}
      >
        {!hasToken ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              defaultValue=""
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="My Token" />
                </FormControl>
              )}
            />
            <div className="flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                isDisabled={isSubmitting}
              >
                {tokenData?.name ? "Update" : "Create"}
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("token", false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 break-all">{token}</p>
            <Tooltip content={copyTextToken}>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(token);
                  setCopyTextToken("Copied");
                }}
              >
                <FontAwesomeIcon icon={isCopyingToken ? faCheck : faCopy} />
              </IconButton>
            </Tooltip>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
