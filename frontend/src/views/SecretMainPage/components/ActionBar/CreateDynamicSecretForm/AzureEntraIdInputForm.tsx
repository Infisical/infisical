import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
} from "@app/components/v2";
import { useCreateDynamicSecret } from "@app/hooks/api";
import { useGetDynamicSecretProviderData } from "@app/hooks/api/dynamicSecret/queries";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

const formSchema = z.object({
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
        handleSubmit
    } = useForm<TForm>({
        resolver: zodResolver(formSchema)
    });

    const [selectedUsers, setSelectedUsers] = useState([]);
    const users = useGetDynamicSecretProviderData({ provider: { type: DynamicSecretProviders.AzureEntraId, inputs: { tenantId: "<tenant id from callback>", userId: "test" } }, dataFetchType: "Users" }).data
    const createDynamicSecret = useCreateDynamicSecret();

    const handleCreateDynamicSecret = async ({ name, maxTTL, defaultTTL }: TForm) => {
        // wait till previous request is finished
        if (createDynamicSecret.isLoading) return;
        try {
            selectedUsers.map(async (user: {id: string, name: string})=>{
                await createDynamicSecret.mutateAsync({
                    provider: { type: DynamicSecretProviders.AzureEntraId, inputs: { userId: user.id, tenantId: "<tenant id from callback>" } },
                    maxTTL,
                    name: `${name  }-${  user.name}`,
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
                            Select Users
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center space-x-2">
                                {users &&
                                    <ListBoxMultiple
                                        isSelected={selectedUsers}
                                        data={users}
                                        onChange={setSelectedUsers}
                                    />
                                }
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex items-center space-x-4">
                    <Button type="submit" isLoading={isSubmitting}>
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
