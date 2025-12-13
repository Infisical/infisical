import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDownIcon, ShieldIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton, Input, ModalClose } from "@app/components/v2";
import { PamResourceType, TSSHResource } from "@app/hooks/api/pam";
import { getAuthToken } from "@app/hooks/api/reactQuery";

import { GenericResourceFields, genericResourceFieldsSchema } from "./GenericResourceFields";

type Props = {
  resource?: TSSHResource;
  onSubmit: (formData: FormData) => Promise<void>;
};

const BaseSshConnectionDetailsSchema = z.object({
  host: z.string().trim().min(1, "Host is required"),
  port: z.number().int().min(1).max(65535)
});

const formSchema = genericResourceFieldsSchema.extend({
  resourceType: z.literal(PamResourceType.SSH),
  connectionDetails: BaseSshConnectionDetailsSchema
});

type FormData = z.infer<typeof formSchema>;

export const SSHResourceForm = ({ resource, onSubmit }: Props) => {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const isUpdate = Boolean(resource);

  const [setupSshCaCommand, setSetupSshCaCommand] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    setSetupSshCaCommand(
      `curl -H "Authorization: Bearer ${getAuthToken()}" "${siteURL}/api/v1/pam/resources/ssh/${resource?.id}/ssh-ca-setup" | sudo bash`
    );
  }, [siteURL, resource]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: resource ?? {
      resourceType: PamResourceType.SSH,
      connectionDetails: {
        host: "",
        port: 22
      }
    }
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <GenericResourceFields />
        <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3 pb-0">
          <div className="mt-[0.675rem] flex items-start gap-2">
            <Controller
              name="connectionDetails.host"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="flex-1"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Host"
                >
                  <Input placeholder="example.com or 192.168.1.1" {...field} />
                </FormControl>
              )}
            />
            <Controller
              name="connectionDetails.port"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  className="w-28"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Port"
                >
                  <Input type="number" {...field} />
                </FormControl>
              )}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCmdOpen(!cmdOpen)}
          className="mb-4 flex w-full cursor-pointer flex-col rounded-md border border-mineshaft-500 bg-mineshaft-700 p-3 text-sm hover:bg-mineshaft-600"
        >
          <div className="flex gap-2.5">
            <ShieldIcon className="mt-0.5 size-6 shrink-0 text-info" />
            <div className="flex w-full flex-col">
              <div className="flex justify-between gap-2 pr-1">
                <div className="flex flex-col text-left">
                  <span className="text-base">Certificate-Based Authentication</span>
                  <span className="text-sm text-mineshaft-300">
                    Optional: Install CA certificate if you plan to use certificate authentication
                    for user accounts
                  </span>
                </div>
                <ChevronDownIcon
                  className={twMerge(
                    "shrink-0 text-mineshaft-400 transition-transform duration-200 ease-in-out",
                    cmdOpen && "rotate-180"
                  )}
                />
              </div>
              <div
                className={twMerge(
                  "grid transition-all duration-200 ease-in-out",
                  cmdOpen ? "mt-2 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col text-left">
                    <span className="mt-2 text-sm text-mineshaft-300">
                      Run this command on the target host:
                    </span>
                    <div className="mt-1 flex items-center gap-1">
                      <Input value={setupSshCaCommand} isDisabled />
                      <IconButton
                        ariaLabel="copy"
                        variant="plain"
                        colorSchema="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(setupSshCaCommand);
                          createNotification({
                            text: "Command copied to clipboard",
                            type: "info"
                          });
                        }}
                        className="size-8 shrink-0"
                      >
                        <FontAwesomeIcon icon={faCopy} className="text-mineshaft-200" />
                      </IconButton>
                    </div>
                    <div className="mt-4 flex flex-col gap-1 text-xs text-mineshaft-300">
                      <span>This command will:</span>
                      <span>• Install the resource CA certificate</span>
                      <span>• Configure SSH to trust certificate-based authentication</span>
                      <span>• Enable seamless access for authorized users</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>
        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Details" : "Create Resource"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
