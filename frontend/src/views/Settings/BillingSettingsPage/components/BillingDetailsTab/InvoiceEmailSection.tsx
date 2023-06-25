import { useEffect } from "react";
import {
  Input,
  Button,
  FormControl
} from "@app/components/v2";
import { Controller, useForm } from 'react-hook-form'; 
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useOrganization } from "@app/context";
import { 
    useGetOrgBillingDetails,
    useUpdateOrgBillingDetails
} from "@app/hooks/api";

const schema = yup.object({
    email: yup.string().required('Email is required')
}).required();

export const InvoiceEmailSection = () => {
    const { currentOrg } = useOrganization();
    const { reset, control, register, handleSubmit, watch, formState: { errors } } = useForm({
        defaultValues: {
            name: ''
        },
        resolver: yupResolver(schema)
    });
    const { data } = useGetOrgBillingDetails(currentOrg?._id ?? '');
    const updateOrgBillingDetails = useUpdateOrgBillingDetails();

    useEffect(() => {
        if (data) {
            reset({
                email: data?.email ?? ''
            });
        }
    }, [data]);

    const onFormSubmit = async ({ email }: { email: string }) => {
        try {
            if (!currentOrg?._id) return;
            if (email === '') return;
            await updateOrgBillingDetails.mutateAsync({
                email,
                organizationId: currentOrg._id
            });
        } catch (err) {
            console.error(err);
        }
    }

    return (
        <form 
            onSubmit={handleSubmit(onFormSubmit)}
            className="p-4 bg-mineshaft-900 mt-8 max-w-screen-lg rounded-lg border border-mineshaft-600"
        >
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Invoice email recipient
                </h2>
                <Button 
                    color="mineshaft"
                    type="submit"
                >
                    Save
                </Button>
            </div>
            <div className="max-w-md">
                <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                            <Input 
                                placeholder="jane@acme.com" 
                                {...field} 
                                className="bg-mineshaft-800" 
                            />
                        </FormControl>
                    )}
                    control={control}
                    name="email"
                />
            </div>
        </form>
    );
}