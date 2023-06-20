import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import {
    Button,
    FormControl,
    Input} from "@app/components/v2";
import {
    useGetServiceAccountById,
    useRenameServiceAccount
} from "@app/hooks/api";

const formSchema = yup.object({
    name: yup.string().required().label("Service Account Name")
});

type FormData = yup.InferType<typeof formSchema>;

type Props = {
    serviceAccountId: string;
}

export const ServiceAccountNameChangeSection = ({
    serviceAccountId
}: Props) => {
    const { data: serviceAccount, isLoading: isServiceAccountLoading } = useGetServiceAccountById(serviceAccountId);

    const renameServiceAccount = useRenameServiceAccount();

    const {
        handleSubmit,
        control,
        reset,
        formState: { isDirty, isSubmitting }
    } = useForm<FormData>({ resolver: yupResolver(formSchema) });

    useEffect(() => {
        reset({ name: serviceAccount?.name });
    }, [serviceAccount?.name]);
    
    const onFormSubmit = async ({ name }: FormData) => {
        try {
            await renameServiceAccount.mutateAsync({
                serviceAccountId,
                name
            });
        } catch (err) {
            console.error(err);
        }
    }

    return (
        <form 
            onSubmit={handleSubmit(onFormSubmit)}
            className="rounded-md bg-white/5 p-6"
        >
            <p className="mb-4 text-xl font-semibold">Name</p>
            <div className="mb-2 w-full max-w-lg">
                {!isServiceAccountLoading && (
                    <Controller 
                        defaultValue=""
                        render={({ field, fieldState: { error } }) => (
                            <FormControl isError={Boolean(error)} errorText={error?.message}>
                                <Input placeholder="Type your service account name..." {...field} />
                            </FormControl>
                        )}
                        control={control}
                        name="name"
                    />
                )}
            </div>
            <Button
                isLoading={isSubmitting}
                color="mineshaft"
                size="sm"
                type="submit"
                isDisabled={!isDirty || isSubmitting}
                leftIcon={<FontAwesomeIcon icon={faCheck} />}
            >
                Save Changes
            </Button>
        </form>
    );
}
