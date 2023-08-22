import { useState } from "react";
import { Controller, useForm } from "react-hook-form"; 
import { useTranslation } from "react-i18next";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import attemptChangePassword from "@app/components/utilities/attemptChangePassword";
import checkPassword from "@app/components/utilities/checks/checkPassword";
import { 
    Button,
    FormControl,
    Input
} from "@app/components/v2";
import { useUser } from "@app/context";
import { useGetCommonPasswords } from "@app/hooks/api";

type Errors = {
  tooShort?: string,
  tooLong?: string,
  upperCase?: string,
  lowerCase?: string,
  number?: string,
  specialChar?: string,
  repeatedChar?: string,
  breachedPassword?: string
};

const schema = yup.object({
    oldPassword: yup.string().required("Old password is required"),
    newPassword: yup.string().required("New password is required")
}).required();

export type FormData = yup.InferType<typeof schema>;

export const ChangePasswordSection = () => {
    const { t } = useTranslation();
    const { createNotification } = useNotificationContext();
    const { user } = useUser();
    const { data: commonPasswords } = useGetCommonPasswords();
    const { reset, control, handleSubmit } = useForm({
        defaultValues: {
            oldPassword: "",
            newPassword: ""
        },
        resolver: yupResolver(schema)
    });
    const [errors, setErrors] = useState<Errors>({});
    const [isLoading, setIsLoading] = useState(false);

    const onFormSubmit = async ({ oldPassword, newPassword }: FormData) => {
        try {
            if (!user?.email) return;
            if (!commonPasswords) return;

            const errorCheck = await checkPassword({
                password: newPassword,
                commonPasswords,
                setErrors
            });

            if (errorCheck) return;
            
            setIsLoading(true);
            await attemptChangePassword({
                email: user.email,
                currentPassword: oldPassword,
                newPassword
            });
            
            setIsLoading(false);
            createNotification({
                text: "Successfully changed password",
                type: "success"
            });

            reset();
            window.location.href = "/login";
        
        } catch (err) {
            console.error(err);
            setIsLoading(false);
            createNotification({
                text: "Failed to change password",
                type: "error"
            });
        }
    }
    
    return (
        <form 
            onSubmit={handleSubmit(onFormSubmit)}
            className="p-4 bg-mineshaft-900 mb-6 rounded-lg border border-mineshaft-600"
        >
            <h2 className="text-xl font-semibold flex-1 text-mineshaft-100 mb-8">
                Change password
            </h2>
            <div className="max-w-md">
                <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                            <Input 
                                placeholder="Old password" 
                                type="password"
                                {...field} 
                                className="bg-mineshaft-800" 
                            />
                        </FormControl>
                    )}
                    control={control}
                    name="oldPassword"
                />
            </div>
            <div className="max-w-md">
                <Controller
                    defaultValue=""
                    render={({ field, fieldState: { error } }) => (
                        <FormControl isError={Boolean(error)} errorText={error?.message}>
                            <Input 
                                placeholder="New password" 
                                type="password"
                                {...field} 
                                className="bg-mineshaft-800" 
                            />
                        </FormControl>
                    )}
                    control={control}
                    name="newPassword"
                />
            </div>
            {Object.keys(errors).length > 0 && (
                <div className="my-4 max-w-md flex flex-col items-start rounded-md bg-white/5 px-2 py-2">
                    <div className="mb-2 text-sm text-gray-400">{t("section.password.validate-base")}</div> 
                    {Object.keys(errors).map((key) => {
                        if (errors[key as keyof Errors]) {
                            return (
                                <div className="ml-1 flex flex-row items-top justify-start" key={key}>
                                    <div>
                                        <FontAwesomeIcon 
                                            icon={faXmark} 
                                            className="text-md text-red ml-0.5 mr-2.5"
                                        />
                                    </div>
                                    <p className="text-gray-400 text-sm">
                                        {errors[key as keyof Errors]} 
                                    </p>
                                </div>
                            );
                        }

                        return null;
                    })}
                </div>
            )}
            <Button
                type="submit"
                colorSchema="secondary"
                isLoading={isLoading}
                isDisabled={isLoading}
            >
                Save
            </Button>
        </form>
    );
}