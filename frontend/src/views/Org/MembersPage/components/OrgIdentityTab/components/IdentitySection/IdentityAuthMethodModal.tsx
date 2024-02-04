import { Controller, useForm } from "react-hook-form"; 
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import {
    FormControl,
    Modal,
    ModalContent,
    Select,
    SelectItem,
    UpgradePlanModal
} from "@app/components/v2";
import { IdentityAuthMethod } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityUniversalAuthForm } from "./IdentityUniversalAuthForm";

type Props = {
    popUp: UsePopUpState<["identityAuthMethod", "upgradePlan"]>;
    handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
    handlePopUpToggle: (popUpName: keyof UsePopUpState<["identityAuthMethod", "upgradePlan"]>, state?: boolean) => void;
}

const identityAuthMethods = [
    { label: "Universal Auth", value: IdentityAuthMethod.UNIVERSAL_AUTH }
];

const schema = yup.object({
    authMethod: yup.string().required("Auth method is required"), // TODO: better enforcement here
}).required();

export type FormData = yup.InferType<typeof schema>;

export const IdentityAuthMethodModal = ({
    popUp,
    handlePopUpOpen,
    handlePopUpToggle
}: Props) => {

    const {
        control,
        // watch,
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });

    const identityAuthMethodData = popUp?.identityAuthMethod?.data as {
        identityId: string;
        name: string;
        authMethod?: IdentityAuthMethod;
    }
    
    // const authMethod = watch("authMethod");
    
    const renderIdentityAuthForm = () => {
        return (
            <IdentityUniversalAuthForm 
                handlePopUpOpen={handlePopUpOpen}
                handlePopUpToggle={handlePopUpToggle}
                identityAuthMethodData={identityAuthMethodData}
            />
        );
    }
    
    return (
        <Modal
            isOpen={popUp?.identityAuthMethod?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("identityAuthMethod", isOpen);
            }}
        >
            <ModalContent title={`${identityAuthMethodData?.authMethod ? "Update" : "Configure"} Identity Auth Method for ${identityAuthMethodData?.name ?? ""}`}>
                <Controller
                    control={control}
                    name="authMethod"
                    defaultValue={IdentityAuthMethod.UNIVERSAL_AUTH}
                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                        <FormControl
                            label="Auth Method"
                            errorText={error?.message}
                            isError={Boolean(error)}
                        >
                            <Select
                                defaultValue={field.value}
                                {...field}
                                onValueChange={(e) => onChange(e)}
                                className="w-full"
                            >
                                {identityAuthMethods.map(({ label, value }) => (
                                    <SelectItem value={String(value || "")} key={label}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                />
                {renderIdentityAuthForm()}
                <UpgradePlanModal
                    isOpen={popUp?.upgradePlan?.isOpen}
                    onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                    text="You can use IP allowlisting if you switch to Infisical's Pro plan."
                />
            </ModalContent>
        </Modal>
    );
}

