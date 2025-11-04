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
  Select,
  SelectItem
} from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { useCreateAPIKey } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const expirations = [
  { label: "1 day", value: "1d" },
  { label: "7 days", value: "7d" },
  { label: "1 month", value: "1mo" },
  { label: "6 months", value: "6mo" },
  { label: "12 months", value: "12mo" }
];

const expirationMapping: { [key: string]: number } = {
  "1d": 86400,
  "7d": 604800,
  "1mo": 2592000,
  "6mo": 15552000,
  "12mo": 31104000
};

const schema = z
  .object({
    name: z.string(),
    expiresIn: z.string()
  })
  .required();

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["addAPIKey"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addAPIKey"]>, state?: boolean) => void;
};

export const AddAPIKeyModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [newAPIKey, setNewAPIKey] = useState("");
  const [isAPIKeyCopied, setIsAPIKeyCopied] = useToggle(false);

  const { mutateAsync, isPending } = useCreateAPIKey();

  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isAPIKeyCopied) {
      timer = setTimeout(() => setIsAPIKeyCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [setIsAPIKeyCopied]);

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(newAPIKey);
    setIsAPIKeyCopied.on();
  };

  const onFormSubmit = async ({ name, expiresIn }: FormData) => {
    const { apiKey } = await mutateAsync({
      name,
      expiresIn: expirationMapping[expiresIn]
    });

    setNewAPIKey(apiKey);

    createNotification({
      text: "Successfully created API key",
      type: "success"
    });

    reset();
  };

  const hasAPIKey = Boolean(newAPIKey);

  return (
    <Modal
      isOpen={popUp?.addAPIKey?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addAPIKey", isOpen);
        reset();
        setNewAPIKey("");
      }}
    >
      <ModalContent title="Create API Key">
        {!hasAPIKey ? (
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <Controller
              control={control}
              defaultValue=""
              name="name"
              render={({ field, fieldState: { error } }) => (
                <FormControl label="Name" isError={Boolean(error)} errorText={error?.message}>
                  <Input {...field} placeholder="My API Key" />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="expiresIn"
              defaultValue="6mo"
              render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                <FormControl label="Expiration" errorText={error?.message} isError={Boolean(error)}>
                  <Select
                    defaultValue={field.value}
                    {...field}
                    onValueChange={(e) => onChange(e)}
                    className="w-full"
                  >
                    {expirations.map(({ label, value }) => (
                      <SelectItem value={String(value || "")} key={`api-key-expiration-${label}`}>
                        {label}
                      </SelectItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
            <div className="mt-8 flex items-center">
              <Button
                className="mr-4"
                size="sm"
                type="submit"
                isLoading={isPending}
                isDisabled={isPending}
              >
                Add
              </Button>
              <Button
                colorSchema="secondary"
                variant="plain"
                onClick={() => handlePopUpToggle("addAPIKey", false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-2 mr-2 mb-3 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 break-all">{newAPIKey}</p>
            <IconButton
              ariaLabel="copy icon"
              colorSchema="secondary"
              className="group relative"
              onClick={copyTokenToClipboard}
            >
              <FontAwesomeIcon icon={isAPIKeyCopied ? faCheck : faCopy} />
              <span className="group-hover:animate-fade-in absolute -top-20 -left-8 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex">
                Click to copy
              </span>
            </IconButton>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
