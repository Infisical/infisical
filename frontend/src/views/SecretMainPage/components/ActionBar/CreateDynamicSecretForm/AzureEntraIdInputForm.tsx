import { Controller, useForm } from "react-hook-form";
import Link from "next/link";
import { faArrowUpRightFromSquare, faBookOpen, faCheckCircle, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
    Button,
    FormControl,
    Input,
    Spinner,
} from "@app/components/v2";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@app/components/v2/Dropdown/Dropdown";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { useGetDynamicSecretProviderData } from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
    selectedUsers: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        email: z.string().min(1),
    })),
    provider: z.object({
        tenantId: z.string().min(1),
        applicationId: z.string().min(1),
        clientSecret: z.string().min(1)
    }),
    defaultTTL: z.string().superRefine((val, ctx) => {
        const valMs = ms(val);
        if (valMs < 60 * 1000)
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
        // a day
        if (valMs > 24 * 60 * 60 * 1000)
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
    }),
    maxTTL: z
        .string()
        .optional()
        .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            // a day
            if (valMs > 24 * 60 * 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than a day" });
        }),
    name: z.string().min(1).refine((val) => val.toLowerCase() === val, "Must be lowercase")
});
type TForm = z.infer<typeof formSchema>;

type Props = {
    onCompleted: () => void;
    onCancel: () => void;
    secretPath: string;
    projectSlug: string;
    environment: string;
};

export const AzureEntraIdInputForm = ({
    onCompleted,
    onCancel,
    environment,
    secretPath,
    projectSlug
}: Props) => {
    const {
        control,
        formState: { isSubmitting },
        watch,
        handleSubmit
    } = useForm<TForm>({
        resolver: zodResolver(formSchema)
    });
    const tenantId = watch("provider.tenantId");
    const applicationId = watch("provider.applicationId");
    const clientSecret = watch("provider.clientSecret");

    const configurationComplete = tenantId && applicationId && clientSecret;
    const { data, isLoading, isFetched, isError, isFetching } = useGetDynamicSecretProviderData({ dataFetchType: "Users", provider: { type: DynamicSecretProviders.AzureEntraId, inputs: { userId: "unused", email: "unused", tenantId, applicationId, clientSecret } }, enabled: !!configurationComplete });
    const createDynamicSecret = useCreateDynamicSecret();

    const handleCreateDynamicSecret = async ({ name, selectedUsers, provider, maxTTL, defaultTTL }: TForm) => {
        // wait till previous request is finished
        if (createDynamicSecret.isLoading) return;
        try {
            selectedUsers.map(async (user: { id: string, name: string, email: string }) => {
                await createDynamicSecret.mutateAsync({
                    provider: { type: DynamicSecretProviders.AzureEntraId, inputs: { userId: user.id, tenantId: provider.tenantId, email: user.email, applicationId: provider.applicationId, clientSecret: provider.clientSecret } },
                    maxTTL,
                    name: `${name}-${user.name}`,
                    path: secretPath,
                    defaultTTL,
                    projectSlug,
                    environmentSlug: environment
                });
            });
            onCompleted();
        } catch (err) {
            createNotification({
                type: "error",
                text: "Failed to create dynamic secret"
            });
        }
    };

    return (
        <div>
            <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
                <div>
                    <div className="flex items-center space-x-2">
                        <div className="flex-grow">
                            <Controller
                                control={control}
                                defaultValue=""
                                name="name"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label="Secret Prefix"
                                        isError={Boolean(error)}
                                        errorText={error?.message}
                                    >
                                        <Input {...field} placeholder="dynamic-secret" />
                                    </FormControl>
                                )}
                            />
                        </div>
                        <div className="w-32">
                            <Controller
                                control={control}
                                name="defaultTTL"
                                defaultValue="1h"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label={<TtlFormLabel label="Default TTL" />}
                                        isError={Boolean(error?.message)}
                                        errorText={error?.message}
                                    >
                                        <Input {...field} />
                                    </FormControl>
                                )}
                            />
                        </div>
                        <div className="w-32">
                            <Controller
                                control={control}
                                name="maxTTL"
                                defaultValue="24h"
                                render={({ field, fieldState: { error } }) => (
                                    <FormControl
                                        label={<TtlFormLabel label="Max TTL" />}
                                        isError={Boolean(error?.message)}
                                        errorText={error?.message}
                                    >
                                        <Input {...field} />
                                    </FormControl>
                                )}
                            />
                        </div>
                    </div>
                    <div>
                        <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
                            Configuration 
                            <Link href="https://infisical.com/docs/documentation/platform/dynamic-secrets/azure-entra-id" passHref>
                                <a target="_blank" rel="noopener noreferrer">
                                    <div className="ml-2 mb-1 inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-sm text-yellow opacity-80 hover:opacity-100">
                                        <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                                        Docs
                                        <FontAwesomeIcon
                                            icon={faArrowUpRightFromSquare}
                                            className="ml-1.5 mb-[0.07rem] text-xxs"
                                        />
                                    </div>
                                </a>
                            </Link>
                        </div>
                        <div className="flex flex-col">
                            <div className="flex-grow">
                                <Controller
                                    control={control}
                                    defaultValue=""
                                    name="provider.tenantId"
                                    render={({ field, fieldState: { error } }) => (
                                        <FormControl
                                            label="Tenant Id"
                                            isError={Boolean(error)}
                                            errorText={error?.message}
                                        >
                                            <Input {...field} placeholder="Tenant Id from Azure Entra ID App installation" />
                                        </FormControl>
                                    )}

                                />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <div className="flex-grow">
                                <Controller
                                    control={control}
                                    defaultValue=""
                                    name="provider.applicationId"
                                    render={({ field, fieldState: { error } }) => (
                                        <FormControl
                                            label="Application Id"
                                            isError={Boolean(error)}
                                            errorText={error?.message}
                                        >
                                            <Input {...field} placeholder="Application ID from Azure Entra ID App installation" />
                                        </FormControl>
                                    )}

                                />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <div className="flex-grow">
                                <Controller
                                    control={control}
                                    defaultValue=""
                                    name="provider.clientSecret"
                                    render={({ field, fieldState: { error } }) => (
                                        <FormControl
                                            label="Client Secret"
                                            isError={Boolean(error)}
                                            errorText={error?.message}
                                        >
                                            <Input {...field} placeholder="Client Secret from Azure Entra ID App installation" />
                                        </FormControl>
                                    )}

                                />
                            </div>
                        </div>
                    </div>
                    <div>

                        <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
                            Select Users
                        </div>
                        <div className="mb-4 flex items-center text-sm font-normal text-mineshaft-400">
                            &nbsp; We create a unique dynamic secret for each user in Entra Id.
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center space-x-4">
                                {
                                    configurationComplete && !isError && !isFetching && isFetched && data &&
                                    <Controller
                                        control={control}
                                        name="selectedUsers"
                                        render={({ field: { value, onChange }, fieldState: { error } }) => (
                                            <FormControl
                                                isRequired
                                                isError={Boolean(error)}
                                                errorText={error?.message}
                                            >
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild className="w-72">
                                                        <Input
                                                            isReadOnly
                                                            value={value?.length ? `${value.length} selected` : "None"}
                                                            className="text-left"
                                                        />
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start"
                                                        style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
                                                    >
                                                        {data.map((user) => {
                                                            const ids = value?.map((selectedUser) => selectedUser.id)
                                                            const isChecked = ids?.includes(user.id);
                                                            return (
                                                                <DropdownMenuItem
                                                                    onClick={(evt) => {
                                                                        evt.preventDefault();
                                                                        onChange(
                                                                            isChecked
                                                                                ? value?.filter((el) => el.id !== user.id)
                                                                                : [...(value || []), user]
                                                                        );
                                                                    }}
                                                                    key={`create-policy-members-${user.id}`}
                                                                    iconPos="right"
                                                                    icon={isChecked && <FontAwesomeIcon icon={faCheckCircle} />}
                                                                >
                                                                    {user.name} <br /> {`(${user.email})`}
                                                                </DropdownMenuItem>
                                                            );
                                                        })}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </FormControl>
                                        )}
                                    />
                                }
                                {
                                    configurationComplete && isFetching && (<div className="pl-3 pb-2 w-full flex items-center" ><Spinner size="xs" /><p> &nbsp; Loading </p></div>)
                                }
                                {
                                    configurationComplete && !isFetching && isError && (<div className="pl-3 pb-2 w-full flex items-center"><FontAwesomeIcon icon={faWarning} /> <p> &nbsp;  Error loading users please ensure Entra Id app is installed and configuration is correct</p></div>)
                                }
                                {
                                    !configurationComplete && (<div className="pl-3 pb-2 w-full flex items-center" ><FontAwesomeIcon icon={faWarning} /><p> &nbsp; Complete configuration to fetch users</p></div>)
                                }
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex items-center space-x-4">
                    <Button type="submit" isLoading={isSubmitting} isDisabled={isLoading || isError}>
                        Submit
                    </Button>
                    <Button variant="outline_bg" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </form>
        </div>
    );
};
