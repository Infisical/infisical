import crypto from "crypto";

import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faCheck, faCopy, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useCreateServiceToken } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const apiTokenExpiry = [
  { label: "1 Day", value: 86400 },
  { label: "7 Days", value: 604800 },
  { label: "1 Month", value: 2592000 },
  { label: "6 months", value: 15552000 },
  { label: "12 months", value: 31104000 },
  { label: "Never", value: null }
];

const schema = z.object({
  name: z.string().max(100),
  scopes: z
    .object({
      environment: z.string().max(50),
      secretPath: z
        .string()
        .default("/")
        .transform((val) =>
          typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
        )
    })
    .array()
    .min(1),
  expiresIn: z.string().optional(),
  permissions: z
    .object({
      read: z.boolean(),
      readValue: z.boolean(),
      write: z.boolean()
    })
    .required()
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["createAPIToken"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["createAPIToken"]>, state?: boolean) => void;
};

const ServiceTokenForm = () => {
  const { t } = useTranslation();

  const { currentWorkspace } = useWorkspace();
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      scopes: [
        {
          secretPath: "/",
          environment: currentWorkspace?.environments?.[0]?.slug
        }
      ]
    }
  });

  const { fields: tokenScopes, append, remove } = useFieldArray({ control, name: "scopes" });

  const [newToken, setToken] = useState("");
  const [isTokenCopied, setIsTokenCopied] = useToggle(false);

  const createServiceToken = useCreateServiceToken();
  const hasServiceToken = Boolean(newToken);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isTokenCopied) {
      timer = setTimeout(() => setIsTokenCopied.off(), 2000);
    }

    return () => clearTimeout(timer);
  }, [isTokenCopied]);

  const copyTokenToClipboard = () => {
    navigator.clipboard.writeText(newToken);
    setIsTokenCopied.on();
  };

  const onFormSubmit = async ({ name, scopes, expiresIn, permissions }: FormData) => {
    try {
      if (!currentWorkspace?.id) return;

      const randomBytes = crypto.randomBytes(16).toString("hex");

      const { serviceToken } = await createServiceToken.mutateAsync({
        encryptedKey: "",
        iv: "",
        tag: "",
        scopes,
        expiresIn: Number(expiresIn),
        name,
        workspaceId: currentWorkspace.id,
        randomBytes,
        permissions: Object.entries(permissions)
          .filter(([, permissionsValue]) => permissionsValue)
          .map(([permissionsKey]) => permissionsKey)
      });

      setToken(serviceToken);
      createNotification({
        text: "Successfully created a service token",
        type: "success"
      });
    } catch (err) {
      console.error(err);
      const axiosError = err as AxiosError;
      if (axiosError?.response?.status === 401) {
        createNotification({
          text: "You do not have access to the selected environment/path",
          type: "error"
        });
      } else {
        createNotification({
          text: "Failed to create a service token",
          type: "error"
        });
      }
    }
  };

  return !hasServiceToken ? (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="name"
        defaultValue=""
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label={t("section.token.add-dialog.name")}
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Input {...field} placeholder="Type your token name" />
          </FormControl>
        )}
      />
      {tokenScopes.map(({ id }, index) => (
        <div className="mb-3 flex items-end space-x-2" key={id}>
          <Controller
            control={control}
            name={`scopes.${index}.environment`}
            defaultValue={currentWorkspace?.environments?.[0]?.slug}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                className="mb-0"
                label={index === 0 ? "Environment" : undefined}
                errorText={error?.message}
                isError={Boolean(error)}
              >
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {currentWorkspace?.environments.map(({ name, slug }) => (
                    <SelectItem value={slug} key={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name={`scopes.${index}.secretPath`}
            defaultValue="/"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                className="mb-0 flex-grow"
                label={index === 0 ? "Secrets Path" : undefined}
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="can be /, /nested/**, /**/deep" />
              </FormControl>
            )}
          />
          <IconButton
            className="p-3"
            ariaLabel="remove"
            colorSchema="danger"
            onClick={() => remove(index)}
          >
            <FontAwesomeIcon icon={faTrashCan} size="sm" />
          </IconButton>
        </div>
      ))}
      <div className="my-4 ml-1">
        <Button
          variant="outline_bg"
          onClick={() =>
            append({
              environment: currentWorkspace?.environments?.[0]?.slug || "",
              secretPath: ""
            })
          }
          leftIcon={<FontAwesomeIcon icon={faPlus} />}
          size="xs"
        >
          Add Scope
        </Button>
      </div>
      <Controller
        control={control}
        name="expiresIn"
        defaultValue={String(apiTokenExpiry?.[0]?.value)}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Expiration" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {apiTokenExpiry.map(({ label, value }) => (
                <SelectItem value={String(value)} key={label}>
                  {label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="permissions"
        defaultValue={{
          read: true,
          readValue: false,
          write: false
        }}
        render={({ field: { onChange, value }, fieldState: { error } }) => {
          const options = [
            {
              label: "Read (default)",
              value: "read"
            },
            {
              label: "Write (optional)",
              value: "write"
            }
          ] as const;

          return (
            <FormControl label="Permissions" errorText={error?.message} isError={Boolean(error)}>
              <>
                {options.map(({ label, value: optionValue }) => {
                  return (
                    <Checkbox
                      id={String(value[optionValue])}
                      key={optionValue}
                      isChecked={value[optionValue]}
                      isDisabled={optionValue === "read"}
                      onCheckedChange={(state) => {
                        onChange({
                          ...value,
                          [optionValue]: state
                        });
                      }}
                    >
                      {label}
                    </Checkbox>
                  );
                })}
              </>
            </FormControl>
          );
        }}
      />
      <div className="mt-8 flex items-center">
        <Button className="mr-4" type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
          Create
        </Button>
        <ModalClose asChild>
          <Button variant="plain" colorSchema="secondary">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  ) : (
    <div className="mb-3 mr-2 mt-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
      <p className="mr-4 break-all">{newToken}</p>
      <IconButton
        ariaLabel="copy icon"
        colorSchema="secondary"
        className="group relative"
        onClick={copyTokenToClipboard}
      >
        <FontAwesomeIcon icon={isTokenCopied ? faCheck : faCopy} />
        <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
          {t("common.click-to-copy")}
        </span>
      </IconButton>
    </div>
  );
};

export const AddServiceTokenModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { t } = useTranslation();

  const { currentWorkspace } = useWorkspace();

  return (
    <Modal
      isOpen={popUp?.createAPIToken?.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("createAPIToken", open);
      }}
    >
      <ModalContent
        title={
          t("section.token.add-dialog.title", {
            target: currentWorkspace?.name
          }) as string
        }
        subTitle={t("section.token.add-dialog.description") as string}
      >
        <ServiceTokenForm />
      </ModalContent>
    </Modal>
  );
};
