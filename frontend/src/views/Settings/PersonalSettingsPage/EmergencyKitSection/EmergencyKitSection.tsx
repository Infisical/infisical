import { Controller, useForm } from "react-hook-form"; 
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import issueBackupKey from "@app/components/utilities/cryptography/issueBackupKey";
import { 
    Button,
    FormControl,
    Input
} from "@app/components/v2";
import { useUser } from "@app/context";

const schema = yup.object({
    password: yup.string().required("Password is required")
}).required();

export type FormData = yup.InferType<typeof schema>;

export const EmergencyKitSection = () => {
    const { createNotification } = useNotificationContext();
    const { user } = useUser();
    const { reset, control, handleSubmit } = useForm({
        defaultValues: {
            password: "",
        },
        resolver: yupResolver(schema)
    });
    
    const onFormSubmit = ({
        password
    }: FormData) => {
        try {
            if (!user?.email) return;

            issueBackupKey({
                email: user.email,
                password,
                personalName: `${user.firstName} ${user.lastName}`,
                setBackupKeyError: () => {},
                setBackupKeyIssued: () => {}
            });
            
            reset();
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to download emergency kit",
                type: "error"
            });
        }
    }
    
    return (
        <form 
            onSubmit={handleSubmit(onFormSubmit)}
            className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600"
        >
            <h2 className="text-xl font-semibold flex-1 text-mineshaft-100">
                Emergency Kit
            </h2>
            <p className="text-gray-400 mb-8">
                The kit contains information you can use to recover your account.
            </p>
            <div className="max-w-md">
                <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                            <Input 
                                placeholder="Password" 
                                type="password"
                                {...field} 
                                className="bg-mineshaft-800" 
                            />
                        </FormControl>
                    )}
                    control={control}
                    name="password"
                />
            </div>
            <Button
                type="submit"
                colorSchema="secondary"
                isLoading={false}
            >
                Save
            </Button>
        </form>
    );
}