import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form"; 
import { faCheck, faCopy,faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
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
    Switch,
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

const expirations = [
    { label: "Never", value: "" },
    { label: "1 day", value: "86400" },
    { label: "7 days", value: "604800" },
    { label: "1 month", value: "2592000" },
    { label: "6 months", value: "15552000" },
    { label: "12 months", value: "31104000" }
];

const schema = yup.object({
    name: yup.string().required("MI name is required"),
    expiresIn: yup.string(),
    accessTokenTTL: yup
        .string()
        .test("is-positive-integer", "Access Token TTL must be a positive integer", (value) => {
            if (typeof value === "undefined") {
                return false;
            }
            
            const num = parseInt(value, 10);
            return !Number.isNaN(num) && num > 0 && String(num) === value;
        })
        .required("Access Token TTL is required"),
    role: yup.string(),
    trustedIps: yup
        .array(
        yup.object({
            ipAddress: yup.string().max(50).required().label("IP Address")
        })
        )
        .min(1)
        .required()
        .label("Trusted IP"),
    isRefreshTokenRotationEnabled: yup.boolean().default(false)
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
    const [newServiceTokenJSON, setNewServiceTokenJSON] = useState("");
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
            trustedIps: [{
                ipAddress: "0.0.0.0/0"
            }]
        }
    });

    useEffect(() => {
        let timer: NodeJS.Timeout;

        if (isServiceTokenJSONCopied) {
            timer = setTimeout(() => setIsServiceTokenJSONCopied.off(), 2000);
        }

        return () => clearTimeout(timer);
    }, [setIsServiceTokenJSONCopied]);

    const copyTokenToClipboard = () => {
        navigator.clipboard.writeText(newServiceTokenJSON);
        setIsServiceTokenJSONCopied.on();
    };
    
    useEffect(() => {
        
        const machineIdentity = popUp?.machineIdentity?.data as { 
            machineId: string;
            name: string;
            role: string;
            customRole: {
                name: string;
                slug: string;
            };
            trustedIps: MachineTrustedIp[];
            accessTokenTTL: number;
            isRefreshTokenRotationEnabled: boolean;
        };

        if (!roles?.length) return;
    
        if (machineIdentity) {
            reset({
                name: machineIdentity.name,
                expiresIn: "",
                role: machineIdentity?.customRole?.slug ?? machineIdentity.role,
                trustedIps: machineIdentity.trustedIps.map(({ 
                    ipAddress, 
                    prefix 
                }: MachineTrustedIp) => {
                    return ({
                        ipAddress: `${ipAddress}${prefix !== undefined ? `/${prefix}` : ""}`
                    });
                }),
                accessTokenTTL: String(machineIdentity.accessTokenTTL),
                isRefreshTokenRotationEnabled: machineIdentity.isRefreshTokenRotationEnabled
            });
        } else {
            reset({
                name: "",
                expiresIn: "",
                accessTokenTTL: "7200",
                role: roles[0].slug,
                trustedIps: [{
                    ipAddress: "0.0.0.0/0"
                }]
            });
        }
    }, [popUp?.machineIdentity?.data, roles]);
    
    const { fields: tokenTrustedIps, append: appendTrustedIp, remove: removeTrustedIp } = useFieldArray({ control, name: "trustedIps" });
    
    const onFormSubmit = async ({
        name,
        expiresIn,
        accessTokenTTL,
        role,
        trustedIps,
        isRefreshTokenRotationEnabled
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
                    trustedIps,
                    expiresIn: (!expiresIn) ? undefined : Number(expiresIn),
                    accessTokenTTL: Number(accessTokenTTL),
                    isRefreshTokenRotationEnabled
                });
                
                handlePopUpToggle("machineIdentity", false);
            } else {

                const { refreshToken } = await createMutateAsync({
                    name,
                    role: role || undefined,
                    organizationId: orgId,
                    trustedIps,
                    expiresIn: (!expiresIn) ? undefined : Number(expiresIn),
                    accessTokenTTL: Number(accessTokenTTL),
                    isRefreshTokenRotationEnabled
                });

                setNewServiceTokenJSON(refreshToken);
            }
            
            createNotification({
                text: `Successfully ${popUp?.machineIdentity?.data ? "updated" : "created"} machine identity`,
                type: "success"
            });

            reset();
        } catch (err) {
            const error = err as any;
            const text = error?.response?.data?.message
                ?? `Failed to ${popUp?.machineIdentity?.data ? "updated" : "created"} machine identity`;
            
            createNotification({
                text,
                type: "error"
            });
        }
    }

    const hasServiceTokenJSON = Boolean(newServiceTokenJSON);
    
    return (
        <Modal
            isOpen={popUp?.machineIdentity?.isOpen}
                onOpenChange={(isOpen) => {
                handlePopUpToggle("machineIdentity", isOpen);
                reset();
                setNewServiceTokenJSON("");
            }}
        >
            <ModalContent title={`${popUp?.machineIdentity?.data ? "Update" : "Create"} Machine Identity`}>
                {!hasServiceTokenJSON ? (
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
                                <Controller
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
                                    />
                                    {tokenTrustedIps.map(({ id }, index) => (
                                        <div className="flex items-end space-x-2 mb-3" key={id}>
                                            <Controller
                                                control={control}
                                                name={`trustedIps.${index}.ipAddress`}
                                                defaultValue="0.0.0.0/0"
                                                render={({ field, fieldState: { error } }) => {
                                                    return (
                                                        <FormControl
                                                            className="mb-0 flex-grow"
                                                            label={index === 0 ? "Trusted IP" : undefined}
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
                                                        removeTrustedIp(index);
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
                                                    appendTrustedIp({
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
                                            />
                                            </FormControl>
                                        )}
                                    />
                                    <div className="mt-8">
                                        <Controller
                                            control={control}
                                            name="isRefreshTokenRotationEnabled"
                                            render={({ field: { onChange, value } }) => (
                                                <Switch
                                                    id="label-refresh-token-rotation"
                                                    onCheckedChange={(isChecked) => onChange(isChecked)}
                                                    isChecked={value}
                                                >
                                                    Refresh Token Rotation
                                                </Switch>
                                            )}
                                        />
                                        <p className="mt-4 text-sm font-normal text-mineshaft-400">When enabled, as a result of exchanging a refresh token, a new refresh token will be issued and the existing token will be invalidated.</p>
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
                ) : (
                    <div className="mt-2 mb-3 mr-2 flex items-center justify-end rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
                        <p className="mr-4 break-all">{newServiceTokenJSON}</p>
                        <IconButton
                            ariaLabel="copy icon"
                            colorSchema="secondary"
                            className="group relative"
                            onClick={copyTokenToClipboard}
                        >
                            <FontAwesomeIcon icon={isServiceTokenJSONCopied ? faCheck : faCopy} />
                            <span className="absolute -left-8 -top-20 hidden w-28 translate-y-full rounded-md bg-bunker-800 py-2 pl-3 text-center text-sm text-gray-400 group-hover:flex group-hover:animate-fadeIn">
                                Click to copy
                            </span>
                        </IconButton>
                    </div>
                )}
                <UpgradePlanModal
                    isOpen={popUp?.upgradePlan?.isOpen}
                    onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
                    text="You can use IP allowlisting if you switch to Infisical's Pro plan."
                />
            </ModalContent>
        </Modal>
    );
}