import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import ListBoxMultiple from "@app/components/basic/ListboxMultiple";
import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
    Button,
    FormControl,
    Input,
    Spinner,
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { useGetDynamicSecretProviderData } from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
    provider: z.object({
        tenantId: z.string().min(1),
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

type EntraIDUser = {
    name: string;
    id: string;
    email: string;
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
    const [selectedUsers, setSelectedUsers] = useState<EntraIDUser[]>([]);
    const { data, isLoading, isFetched, isError, isFetching } = useGetDynamicSecretProviderData({ dataFetchType: "Users", provider: {type: DynamicSecretProviders.AzureEntraId, inputs: { userId : "unused", email: "unused", tenantId }}, enabled: !!tenantId });
    const mappedUserList = data?.map((user) => ({
        primaryText: user.name,
        secondaryText: user.email,
        id: user.id,
      }));
    const handleChange = (selected: { primaryText: string; secondaryText: string; id: string }[]) => {
        // Map back to EntraIDUser based on the id or other attributes
        const selectedMappedUsers = data?.filter(user =>
          selected.some(selectedItem => selectedItem.id === user.id)
        );
        if(selectedMappedUsers){
            setSelectedUsers(selectedMappedUsers);
        }
      };
    const createDynamicSecret = useCreateDynamicSecret();

    const handleCreateDynamicSecret = async ({ name, provider, maxTTL, defaultTTL }: TForm) => {
        // wait till previous request is finished
        if (createDynamicSecret.isLoading) return;
        try {
            selectedUsers.map(async (user: { id: string, name: string, email: string }) => {
                await createDynamicSecret.mutateAsync({
                    provider: { type: DynamicSecretProviders.AzureEntraId, inputs: { userId: user.id, tenantId: provider.tenantId, email: user.email } },
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
                    </div>
                    <div>
                        <div className="mb-4 mt-4 border-b border-mineshaft-500 pb-2 pl-1 font-medium text-mineshaft-200">
                            Select Users
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center space-x-2">
                                {
                                    tenantId && !isError && !isFetching && isFetched && data && mappedUserList &&
                                    <ListBoxMultiple
                                        isSelected={mappedUserList.filter(user =>
                                        selectedUsers.some(selectedUser => selectedUser.id === user.id)
                                        )}
                                        onChange={handleChange}
                                        data={mappedUserList}
                                    />
                                }
                                {
                                    tenantId && isFetching && (<><Spinner size="xs" /><p> Loading</p></>)
                                }
                                {
                                    tenantId && !isFetching && isError && (<><FontAwesomeIcon icon={faWarning} /> <p> Error loading users please ensure Entra Id app is installed and tenant ID is correct</p></>)
                                }
                                {
                                    !tenantId && (<><FontAwesomeIcon icon={faWarning} /><p> Enter tenant ID to fetch users</p></>)
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
