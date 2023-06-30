import crypto from "crypto";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  decryptAssymmetric,
  encryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
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
import {
    useCreateServiceToken,
    useGetUserWsKey
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const apiTokenExpiry = [
  { label: "1 Day", value: 86400 },
  { label: "7 Days", value: 604800 },
  { label: "1 Month", value: 2592000 },
  { label: "6 months", value: 15552000 },
  { label: "12 months", value: 31104000 },
  { label: "Never", value: null }
];

const schema = yup.object({
  name: yup.string().max(100).required().label("Service Token Name"),
  environment: yup.string().max(50).required().label("Environment"),
  secretPath: yup.string().required().default("/").label("Secret Path"),
  expiresIn: yup.string().optional().label("Service Token Expiration"),
  permissions: yup
    .object()
    .shape({
      read: yup.boolean().required(),
      write: yup.boolean().required()
    })
    .defined()
    .required()
});

export type FormData = yup.InferType<typeof schema>;

type Props = {
    popUp: UsePopUpState<["createAPIToken"]>;
    handlePopUpToggle: (popUpName: keyof UsePopUpState<["createAPIToken"]>, state?: boolean) => void;
};

export const AddServiceTokenModal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    const { t } = useTranslation();
    const { createNotification } = useNotificationContext();
    const { currentWorkspace } = useWorkspace();
    const {
        control,
        reset,
        handleSubmit,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });

    const [newToken, setToken] = useState("");
    const [isTokenCopied, setIsTokenCopied] = useToggle(false);

    const { data: latestFileKey } = useGetUserWsKey(currentWorkspace?._id ?? "");
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

    const onFormSubmit = async ({
        name,
        environment,
        secretPath,
        expiresIn,
        permissions
    }: FormData) => {
        try {
            if (!currentWorkspace?._id) return;
            if (!latestFileKey) return;

            const key = decryptAssymmetric({
                ciphertext: latestFileKey.encryptedKey,
                nonce: latestFileKey.nonce,
                publicKey: latestFileKey.sender.publicKey,
                privateKey: localStorage.getItem("PRIVATE_KEY") as string
            });

            const randomBytes = crypto.randomBytes(16).toString("hex");

            const { ciphertext, iv, tag } = encryptSymmetric({
                plaintext: key,
                key: randomBytes
            });

            const { serviceToken } = await createServiceToken.mutateAsync({
                encryptedKey: ciphertext,
                iv,
                tag,
                environment,
                secretPath,
                expiresIn: Number(expiresIn),
                name,
                workspaceId: currentWorkspace._id,
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
            createNotification({
                text: "Failed to create a service token",
                type: "error"
            });
        }
    };

    return (
        <Modal
            isOpen={popUp?.createAPIToken?.isOpen}
            onOpenChange={(open) => {
                handlePopUpToggle("createAPIToken", open);
                reset();
                setToken("");
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
                {!hasServiceToken ? (
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
                        <Controller
                            control={control}
                            name="environment"
                            defaultValue={currentWorkspace?.environments?.[0]?.slug}
                            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                                <FormControl
                                    label="Environment"
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
                            name="secretPath"
                            defaultValue="/"
                            render={({ field, fieldState: { error } }) => (
                            <FormControl
                                label="Secrets Path"
                                isError={Boolean(error)}
                                helperText="Tokens can be scoped to a folder path. Default path is /"
                                errorText={error?.message}
                            >
                                <Input {...field} placeholder="Provide a path, default is /" />
                            </FormControl>
                            )}
                        />
                        <Controller
                            control={control}
                            name="expiresIn"
                            defaultValue={String(apiTokenExpiry?.[0]?.value)}
                            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                                <FormControl
                                    label="Expiration"
                                    errorText={error?.message}
                                    isError={Boolean(error)}
                                >
                                    <Select
                                        defaultValue={field.value}
                                        {...field}
                                        onValueChange={(e) => onChange(e)}
                                        className="w-full"
                                    >
                                        {apiTokenExpiry.map(({ label, value }) => (
                                            <SelectItem value={String(value || "")} key={label}>
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
                                ];

                                return (
                                    <FormControl
                                        label="Permissions"
                                        errorText={error?.message}
                                        isError={Boolean(error)}
                                    >
                                        <>
                                            {options.map(({ label, value: optionValue }) => {
                                            return (
                                                <Checkbox
                                                    id={value[optionValue]}
                                                    key={optionValue}
                                                    className="data-[state=checked]:bg-primary"
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
                            <Button
                                className="mr-4"
                                type="submit"
                                isDisabled={isSubmitting}
                                isLoading={isSubmitting}
                            >
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
                    <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
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
              )}
            </ModalContent>
        </Modal> 
    );
}