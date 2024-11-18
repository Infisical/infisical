import { useState } from "react";
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
      description: "",
      ttl: "",
      numUsesLimit: ""
    }
  });

  const popUpData = popUp?.clientSecret?.data as {
    identityId: string;
  };

  const onFormSubmit = async ({ description, ttl, numUsesLimit }: FormData) => {
    try {
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
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to create client secret";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.clientSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("clientSecret", isOpen);
        reset();
        setToken("");
      }}
    >
      <ModalContent
        title="Create Client Secret"
        subTitle={hasToken ? "We will only show this secret once" : ""}
      >
        {!hasToken ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              defaultValue=""
              name="description"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Description"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="My Client Secret" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="ttl"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="TTL (seconds - optional)"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <div className="flex">
                    <Input {...field} placeholder="0" type="number" min="0" step="1" />
                  </div>
                </FormControl>
              )}
            />
            <Controller
              control={control}
              defaultValue=""
              name="numUsesLimit"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Max Number of Uses"
                  isError={Boolean(error)}
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="0" type="number" min="0" step="1" />
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
                Create
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("clientSecret", false)}
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
