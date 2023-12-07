import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form"; 
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { yupResolver } from "@hookform/resolvers/yup";
import { motion } from "framer-motion";
import * as yup from "yup";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
    Button,
    FormControl,
    IconButton,
    Input,
    Modal,
    ModalContent,
    Select,
    SelectItem,
    Tab,
    TabList,
    TabPanel,
    Tabs,
    UpgradePlanModal} from "@app/components/v2";
import {
    useOrganization,
    useSubscription
} from "@app/context";
import { useToggle } from "@app/hooks";
import { 
    useCreateMachineIdentity,
    useGetRoles,
    useUpdateMachineIdentity
} from "@app/hooks/api";
import { MachineTrustedIp } from "@app/hooks/api/machineIdentities/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

enum TabSections {
    General = "general",
    Advanced = "advanced"
}

const schema = yup.object({
    name: yup.string().required("MI name is required"),
    accessTokenTTL: yup
        .string()
        .required("Access Token TTL is required"),
    accessTokenMaxTTL: yup
        .string()
        .required("Access Max Token TTL is required"),
    accessTokenNumUsesLimit: yup
        .string()
        .required("Access Token Max Number of Uses is required"),
    role: yup.string(),
    clientSecretTrustedIps: yup
        .array(
        yup.object({
            ipAddress: yup.string().max(50).required().label("IP Address")
        })
        )
        .min(1)
        .required()
        .label("Client Secret Trusted IP"),
    accessTokenTrustedIps: yup
        .array(
        yup.object({
            ipAddress: yup.string().max(50).required().label("IP Address")
        })
        )
        .min(1)
        .required()
        .label("Access Token Trusted IP")
}).required();

export type FormData = yup.InferType<typeof schema>;

type Props = {
  popUp: UsePopUpState<["machineIdentity", "upgradePlan"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["machineIdentity", "upgradePlan"]>, state?: boolean) => void;
};

export const AddMachineIdentityModal = ({
    popUp,
    handlePopUpOpen,
    handlePopUpToggle
}: Props) => {
    const { createNotification } = useNotificationContext();
    const [isServiceTokenJSONCopied, setIsServiceTokenJSONCopied] = useToggle(false);

    const { subscription } = useSubscription();
    const { currentOrg } = useOrganization();

    const orgId = currentOrg?._id || "";

    const { data: roles } = useGetRoles({
        orgId
    });
    
    const { mutateAsync: createMutateAsync } = useCreateMachineIdentity();
    const { mutateAsync: updateMutateAsync } = useUpdateMachineIdentity();
    
    const {
        control,
        handleSubmit,
        reset,
        formState: { isSubmitting }
    } = useForm<FormData>({
        resolver: yupResolver(schema),
        defaultValues: {
            name: "",
            accessTokenTTL: "7200",
            accessTokenMaxTTL: "0",
            accessTokenNumUsesLimit: "0",
            clientSecretTrustedIps: [{
                ipAddress: "0.0.0.0/0"
            }],
            accessTokenTrustedIps: [{
                ipAddress: "0.0.0.0/0"
            }],
        }
    });

    useEffect(() => {
        let timer: NodeJS.Timeout;

        if (isServiceTokenJSONCopied) {
            timer = setTimeout(() => setIsServiceTokenJSONCopied.off(), 2000);
        }

        return () => clearTimeout(timer);
    }, [setIsServiceTokenJSONCopied]);
    
    useEffect(() => {
        
        const machineIdentity = popUp?.machineIdentity?.data as { 
            machineId: string;
            name: string;
            role: string;
            customRole: {
                name: string;
                slug: string;
            };
            clientSecretTrustedIps: MachineTrustedIp[];
            accessTokenTrustedIps: MachineTrustedIp[];
            accessTokenTTL: number;
            accessTokenMaxTTL: number;
            accessTokenNumUsesLimit: number;
        };

        if (!roles?.length) return;
    
        if (machineIdentity) {
            reset({
                name: machineIdentity.name,
                accessTokenNumUsesLimit: String(machineIdentity.accessTokenNumUsesLimit),
                role: machineIdentity?.customRole?.slug ?? machineIdentity.role,
                clientSecretTrustedIps: machineIdentity.clientSecretTrustedIps.map(({ 
                    ipAddress, 
                    prefix 
                }: MachineTrustedIp) => {
                    return ({
                        ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
                    });
                }),
                accessTokenTrustedIps: machineIdentity.accessTokenTrustedIps.map(({ 
                    ipAddress, 
                    prefix 
                }: MachineTrustedIp) => {
                    return ({
                        ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
                    });
                }),
                accessTokenTTL: String(machineIdentity.accessTokenTTL),
                accessTokenMaxTTL: String(machineIdentity.accessTokenMaxTTL)
            });
        } else {
            reset({
                name: "",
                accessTokenTTL: "7200",
                accessTokenMaxTTL: "0",
                accessTokenNumUsesLimit: "0",
                role: roles[0].slug,
                clientSecretTrustedIps: [{
                    ipAddress: "0.0.0.0/0"
                }],
                accessTokenTrustedIps: [{
                    ipAddress: "0.0.0.0/0"
                }]
            });
        }
    }, [popUp?.machineIdentity?.data, roles]);
    
    const { 
        fields: clientSecretTrustedIpsFields, 
        append: appendClientSecretTrustedIp, 
        remove: removeClientSecretTrustedIp 
    } = useFieldArray({ control, name: "clientSecretTrustedIps" });
    const { 
        fields: accessTokenTrustedIpsFields, 
        append: appendAccessTokenTrustedIp, 
        remove: removeAccessTokenTrustedIp 
    } = useFieldArray({ control, name: "accessTokenTrustedIps" });
    
    const onFormSubmit = async ({
        name,
        accessTokenTTL,
        accessTokenMaxTTL,
        role,
        clientSecretTrustedIps,
        accessTokenTrustedIps,
        accessTokenNumUsesLimit
    }: FormData) => {
        try {
            
            const machineIdentity = popUp?.machineIdentity?.data as { 
                machineId: string;
                name: string;
                role: string;
            };
            
            if (machineIdentity) {
                // update
                
                await updateMutateAsync({
                    machineId: machineIdentity.machineId,
                    name,
                    role: role || undefined,
                    clientSecretTrustedIps,
                    accessTokenTrustedIps,
                    accessTokenTTL: Number(accessTokenTTL),
                    accessTokenMaxTTL: Number(accessTokenMaxTTL),
                    accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit)
                });
                
                handlePopUpToggle("machineIdentity", false);
            } else {

                await createMutateAsync({
                    name,
                    role: role || undefined,
                    organizationId: orgId,
                    clientSecretTrustedIps,
                    accessTokenTrustedIps,
                    accessTokenTTL: Number(accessTokenTTL),
                    accessTokenMaxTTL: Number(accessTokenMaxTTL),
                    accessTokenNumUsesLimit: Number(accessTokenNumUsesLimit)
                });
                
                handlePopUpToggle("machineIdentity", false);
            }
            
            createNotification({
                text: `Successfully ${popUp?.machineIdentity?.data ? "updated" : "created"} machine identity`,
                type: "success"
            });

            reset();
        } catch (err) {
            console.error(err);
            const error = err as any;
            const text = error?.response?.data?.message
                ?? `Failed to ${popUp?.machineIdentity?.data ? "updated" : "created"} machine identity`;
            
            createNotification({
                text,
                type: "error"
            });
        }
    }

    return (
        <Modal
            isOpen={popUp?.machineIdentity?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("machineIdentity", isOpen);
                reset();
            }}
        >
            <ModalContent title={`${popUp?.machineIdentity?.data ? "Update" : "Create"} Machine Identity`}>
                <form onSubmit={handleSubmit(onFormSubmit)}>
                    <Tabs defaultValue={TabSections.General}>
                        <TabList>
                            <div className="flex flex-row border-b border-mineshaft-600 w-full">
                                <Tab value={TabSections.General}>General</Tab>
                                <Tab value={TabSections.Advanced}>Advanced</Tab>
                            </div>
                        </TabList>
                        <TabPanel value={TabSections.General}>
                            <motion.div
                                key="panel-1"
                                transition={{ duration: 0.15 }}
                                initial={{ opacity: 0, translateX: 30 }}
                                animate={{ opacity: 1, translateX: 0 }}
                                exit={{ opacity: 0, translateX: 30 }}
                            >
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
                                            placeholder="Machine 1"
                                        />
                                        </FormControl>
                                    )}
                                />
                                <Controller
                                    control={control}
                                    name="role"
                                    defaultValue=""
                                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                                        <FormControl
                                            label={`${popUp?.machineIdentity?.data ? "Update" : ""} Role`}
                                            errorText={error?.message}
                                            isError={Boolean(error)}
                                            className="mt-4"
                                        >
                                            <Select
                                                defaultValue={field.value}
                                                {...field}
                                                onValueChange={(e) => onChange(e)}
                                                className="w-full"
                                            >
                                                {(roles || []).map(({ name, slug }) => (
                                                    <SelectItem value={slug} key={`st-role-${slug}`}>
                                                        {name}
                                                    </SelectItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    )}
                                />
                                
                            </motion.div>
                        </TabPanel>
                        <TabPanel value={TabSections.Advanced}>
                            <div>
                            {/* <Controller
                                    control={control}
                                    name="expiresIn"
                                    defaultValue=""
                                    render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                                        <FormControl
                                            label={`${popUp?.machineIdentity?.data ? "Update" : ""} Refresh Token Expires In`}
                                            errorText={error?.message}
                                            isError={Boolean(error)}
                                            className="mt-4"
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
                                /> */}
                                <Controller
                                    control={control}
                                    defaultValue="7200"
                                    name="accessTokenMaxTTL"
                                    render={({ field, fieldState: { error } }) => (
                                        <FormControl
                                            label="Access Token Max TTL (seconds)"
                                            isError={Boolean(error)}
                                            errorText={error?.message}
                                        >
                                        <Input 
                                            {...field} 
                                            placeholder="7200"
                                            type="number"
                                            min="0"
                                            step="1"
                                        />
                                        </FormControl>
                                    )}
                                />
                                <Controller
                                    control={control}
                                    defaultValue="7200"
                                    name="accessTokenTTL"
                                    render={({ field, fieldState: { error } }) => (
                                        <FormControl
                                            label="Access Token TTL (seconds)"
                                            isError={Boolean(error)}
                                            errorText={error?.message}
                                        >
                                        <Input 
                                            {...field} 
                                            placeholder="7200"
                                            type="number"
                                            min="0"
                                            step="1"
                                        />
                                        </FormControl>
                                    )}
                                />
                                <Controller
                                    control={control}
                                    defaultValue="0"
                                    name="accessTokenNumUsesLimit"
                                    render={({ field, fieldState: { error } }) => (
                                        <FormControl
                                            label="Access Token Max Number of Uses"
                                            isError={Boolean(error)}
                                            errorText={error?.message}
                                        >
                                        <Input 
                                            {...field} 
                                            placeholder="0"
                                            type="number"
                                            min="0"
                                            step="1"
                                        />
                                        </FormControl>
                                    )}
                                />
                                {clientSecretTrustedIpsFields.map(({ id }, index) => (
                                    <div className="flex items-end space-x-2 mb-3" key={id}>
                                        <Controller
                                            control={control}
                                            name={`clientSecretTrustedIps.${index}.ipAddress`}
                                            defaultValue="0.0.0.0/0"
                                            render={({ field, fieldState: { error } }) => {
                                                return (
                                                    <FormControl
                                                        className="mb-0 flex-grow"
                                                        label={index === 0 ? "Client Secret Trusted IPs" : undefined}
                                                        isError={Boolean(error)}
                                                        errorText={error?.message}
                                                    >
                                                    <Input 
                                                        value={field.value}
                                                        onChange={(e) => {
                                                            if (subscription?.ipAllowlisting) {
                                                                field.onChange(e);
                                                                return;
                                                            }
                                                            
                                                            handlePopUpOpen("upgradePlan");
                                                        }}
                                                        placeholder="123.456.789.0" 
                                                    />
                                                    </FormControl>
                                                );
                                            }}
                                        />
                                        <IconButton
                                            onClick={() => {
                                                if (subscription?.ipAllowlisting) {
                                                    removeClientSecretTrustedIp(index);
                                                    return;
                                                }
                                                
                                                handlePopUpOpen("upgradePlan");
                                            }}
                                            size="lg"
                                            colorSchema="danger"
                                            variant="plain"
                                            ariaLabel="update"
                                            className="p-3"
                                        >
                                            <FontAwesomeIcon icon={faXmark} />
                                        </IconButton>
                                    </div>
                                ))}
                                <div className="my-4 ml-1">
                                    <Button
                                        variant="outline_bg"
                                        onClick={() => {
                                            if (subscription?.ipAllowlisting) {
                                                appendClientSecretTrustedIp({
                                                    ipAddress: "0.0.0.0/0"
                                                })
                                                return;
                                            }

                                            handlePopUpOpen("upgradePlan");
                                        }}
                                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                                        size="xs"
                                    >
                                        Add IP Address
                                    </Button>
                                </div>
                                {accessTokenTrustedIpsFields.map(({ id }, index) => (
                                    <div className="flex items-end space-x-2 mb-3" key={id}>
                                        <Controller
                                            control={control}
                                            name={`accessTokenTrustedIps.${index}.ipAddress`}
                                            defaultValue="0.0.0.0/0"
                                            render={({ field, fieldState: { error } }) => {
                                                return (
                                                    <FormControl
                                                        className="mb-0 flex-grow"
                                                        label={index === 0 ? "Access Token Trusted IPs" : undefined}
                                                        isError={Boolean(error)}
                                                        errorText={error?.message}
                                                    >
                                                    <Input 
                                                        value={field.value}
                                                        onChange={(e) => {
                                                            if (subscription?.ipAllowlisting) {
                                                                field.onChange(e);
                                                                return;
                                                            }
                                                            
                                                            handlePopUpOpen("upgradePlan");
                                                        }}
                                                        placeholder="123.456.789.0" 
                                                    />
                                                    </FormControl>
                                                );
                                            }}
                                        />
                                        <IconButton
                                            onClick={() => {
                                                if (subscription?.ipAllowlisting) {
                                                    removeAccessTokenTrustedIp(index);
                                                    return;
                                                }
                                                
                                                handlePopUpOpen("upgradePlan");
                                            }}
                                            size="lg"
                                            colorSchema="danger"
                                            variant="plain"
                                            ariaLabel="update"
                                            className="p-3"
                                        >
                                            <FontAwesomeIcon icon={faXmark} />
                                        </IconButton>
                                    </div>
                                ))}
                                <div className="my-4 ml-1">
                                    <Button
                                        variant="outline_bg"
                                        onClick={() => {
                                            if (subscription?.ipAllowlisting) {
                                                appendAccessTokenTrustedIp({
                                                    ipAddress: "0.0.0.0/0"
                                                })
                                                return;
                                            }

                                            handlePopUpOpen("upgradePlan");
                                        }}
                                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                                        size="xs"
                                    >
                                        Add IP Address
                                    </Button>
                                </div>
                            </div>
                        </TabPanel>
                    </Tabs>
                    <div className="flex items-center">
                        <Button
                            className="mr-4"
                            size="sm"
                            type="submit"
                            isLoading={isSubmitting}
                            isDisabled={isSubmitting}
                        >
                            {popUp?.machineIdentity?.data ? "Update" : "Create"}
                        </Button>
                        <Button 
                            colorSchema="secondary" 
                            variant="plain"
                            onClick={() => handlePopUpToggle("machineIdentity", false)}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
                <UpgradePlanModal
                    isOpen={popUp?.upgradePlan?.isOpen}
                    onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                    text="You can use IP allowlisting if you switch to Infisical's Pro plan."
                />
            </ModalContent>
        </Modal>
    );
}