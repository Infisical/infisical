import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, FormControl, Input } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { useUpdateOrg } from "@app/hooks/api";

const formSchema = yup.object({
    slug: yup.string().required().label("Project Slug")
});

type FormData = yup.InferType<typeof formSchema>;

export const OrgSlugChangeSection = (): JSX.Element => {
    const { currentOrg } = useOrganization();
    const { createNotification } = useNotificationContext();
    const { handleSubmit, control, reset } = useForm<FormData>({
        resolver: yupResolver(formSchema)
    });
    const { mutateAsync, isLoading } = useUpdateOrg();

    useEffect(() => {
        if (currentOrg) {
            reset({ slug: currentOrg.slug });
        }
    }, [currentOrg]);

    const onFormSubmit = async ({ slug }: FormData) => {
        try {
            if (!currentOrg?.id) return;
            if (slug === "") return;

            await mutateAsync({ orgId: currentOrg?.id, slug });
            createNotification({
                text: "Successfully updated organization slug",
                type: "success"
            });
        } catch (error) {
            console.error(error);
            createNotification({
                text: "Failed to update organization slug",
                type: "error"
            });
        }
    };
    
    return (
        <form
            onSubmit={handleSubmit(onFormSubmit)}
            className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
        >
            <p className="mb-4 text-xl font-semibold text-mineshaft-100">Organization Slug</p>
            <div className="mb-2 max-w-md">
                <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                            <Input placeholder="acme" {...field} />
                        </FormControl>
                    )}
                    control={control}
                    name="slug"
                />
            </div>
            <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
                {(isAllowed) => (
                    <Button
                        isLoading={isLoading}
                        isDisabled={!isAllowed}
                        colorSchema="primary"
                        variant="outline_bg"
                        type="submit"
                    >
                        Save
                    </Button>
                )}
            </OrgPermissionCan>
        </form>
    );
}