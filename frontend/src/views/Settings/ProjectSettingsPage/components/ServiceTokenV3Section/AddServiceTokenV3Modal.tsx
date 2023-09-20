import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { Controller, useForm } from "react-hook-form"; 
import { useWorkspace } from "@app/context";
import {
    Modal,
    ModalContent,
    FormControl,
    Select,
    SelectItem,
    Input,
    Button
} from "@app/components/v2";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useCreateServiceTokenV3 } from "@app/hooks/api";

const expirations = [
    { label: "1 day", value: "86400" },
    { label: "7 days", value: "604800" },
    { label: "1 month", value: "2592000" },
    { label: "6 months", value: "15552000" },
    { label: "12 months", value: "31104000" }
];

const schema = yup.object({
    name: yup.string().required("ST V3 name is required"),
    expiresIn: yup.string().required("ST V3 expiration window is required")
}).required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["createServiceTokenV3"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["createServiceTokenV3"]>, state?: boolean) => void;
};

// Will download a JSON
// Maybe you can set a timer at which point service token is no longer active!
// Maybe you can also set IP allowlist for it too

export const AddServiceTokenV3Modal = ({
    popUp,
    handlePopUpToggle
}: Props) => {
    const { currentWorkspace } = useWorkspace();
    const { mutateAsync } = useCreateServiceTokenV3();
    const { createNotification } = useNotificationContext();
    const {
        control,
        handleSubmit,
        reset
    } = useForm<FormData>({
        resolver: yupResolver(schema)
    });

    const onFormSubmit = async ({
        name,
        expiresIn
    }: FormData) => {
        try {
            if (!currentWorkspace?._id) return;
            
            console.log("onFormSubmit name: ", name);
            console.log("onFormSubmit expiresIn: ", expiresIn);

            const pair = nacl.box.keyPair();
            const secretKeyUint8Array = pair.secretKey;
            const publicKeyUint8Array = pair.publicKey;
            const privateKey = encodeBase64(secretKeyUint8Array);
            const publicKey = encodeBase64(publicKeyUint8Array);
            
            console.log("pair: ", pair);
            console.log("privateKey: ", privateKey);
            console.log("publicKey: ", publicKey );
            const { serviceToken } = await mutateAsync({
                name,
                workspaceId: currentWorkspace._id,
                publicKey
            });
            
            const downloadData = {
                publicKey,
                privateKey,
                serviceToken
            };

            const blob = new Blob([JSON.stringify(downloadData, null, 2)], { type: 'application/json' });
            const href = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = href;
            link.download = `infisical_${name}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            createNotification({
                text: "Successfully created ST V3",
                type: "success"
            });

            reset();
            handlePopUpToggle("createServiceTokenV3", false);
        } catch (err) {
            console.error(err);
            createNotification({
                text: "Failed to create ST V3",
                type: "error"
            });
        }
    }
    
    return (
        <Modal
            isOpen={popUp?.createServiceTokenV3?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("createServiceTokenV3", isOpen);
                reset();
            }}
        >
            <ModalContent title="Create Service Token V3">
                <form onSubmit={handleSubmit(onFormSubmit)}>
                    <Controller
                        control={control}
                        defaultValue=""
                        name="name"
                        render={({ field, fieldState: { error } }) => (
                            <FormControl
                                label="Name"
                                isError={Boolean(error)}
                                errorText={error?.message}
                            >
                            <Input 
                                {...field} 
                                placeholder="My ST V3"
                            />
                            </FormControl>
                        )}
                    />
                    <Controller
                        control={control}
                        name="expiresIn"
                        defaultValue="15552000"
                        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                            <FormControl
                                label="Expiration"
                                errorText={error?.message}
                                isError={Boolean(error)}
                            >
                                <Select
                                    defaultValue={field.value}
                                    {...field}
                                    onValueChange={(e) => onChange(e)}
                                    className="w-full"
                                >
                                    {expirations.map(({ label, value }) => (
                                        <SelectItem value={String(value || "")} key={`api-key-expiration-${label}`}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                    />
                    <div className="mt-8 flex items-center">
                        <Button
                            className="mr-4"
                            size="sm"
                            type="submit"
                            // isLoading={isLoading}
                            // isDisabled={isLoading}
                        >
                            Create
                        </Button>
                        <Button colorSchema="secondary" variant="plain">
                            Cancel
                        </Button>
                    </div>
                </form>
            </ModalContent>
        </Modal>
    );
}