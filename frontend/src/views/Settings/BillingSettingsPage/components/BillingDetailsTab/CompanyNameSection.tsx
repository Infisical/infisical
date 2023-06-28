import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form"; 
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import Button from "@app/components/basic/buttons/Button";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { FormControl,Input } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { 
    useGetOrgBillingDetails,
    useUpdateOrgBillingDetails
} from "@app/hooks/api";

const schema = yup.object({
    name: yup.string().required("Company name is required")
}).required();

export const CompanyNameSection = () => {
    const { createNotification } = useNotificationContext();
    const { currentOrg } = useOrganization();
    const { reset, control, handleSubmit } = useForm({
        defaultValues: {
            name: ""
        },
        resolver: yupResolver(schema)
    });
    const { data } = useGetOrgBillingDetails(currentOrg?._id ?? "");
    const updateOrgBillingDetails = useUpdateOrgBillingDetails();
    
    useEffect(() => {
        if (data) {
            reset({
                name: data?.name ?? ""
            });
        }
    }, [data]);
    
    const onFormSubmit = async ({ name }: { name: string }) => {
        try {
            if (!currentOrg?._id) return;
            if (name === "") return;
            await updateOrgBillingDetails.mutateAsync({
                name,
                organizationId: currentOrg._id
            });
        
            createNotification({
                text: "Successfully updated business name",
                type: "success"
            });
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to update business name",
                type: "error"
            });
        }
    }

    return (
        <form 
            onSubmit={handleSubmit(onFormSubmit)}
            className="p-4 bg-mineshaft-900 mt-8 max-w-screen-lg rounded-lg border border-mineshaft-600"
        >
            <h2 className="text-xl font-semibold flex-1 text-mineshaft-100 mb-8">
                Business name
            </h2>
            <div className="max-w-md">
                <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                            <Input 
                                placeholder="Acme Corp" 
                                {...field} 
                                className="bg-mineshaft-800" 
                            />
                        </FormControl>
                    )}
                    control={control}
                    name="name"
                />
            </div>
            <div className="inline-block">
                <Button
                    text="Save"
                    type="submit"
                    color="mineshaft"
                    size="md"
                    onButtonPressed={() => console.log("Saved company name")}
                />
            </div>
        </form>
    );
}