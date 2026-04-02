import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDownIcon, ShieldIcon } from "lucide-react";
import ms from "ms";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  IconButton,
  Input,
  Select,
  SelectItem,
  Tag
} from "@app/components/v2";
import { useUpdateDynamicSecret } from "@app/hooks/api";
import { TDynamicSecret } from "@app/hooks/api/dynamicSecret/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { SshCertKeyAlgorithm, sshCertKeyAlgorithms } from "@app/hooks/api/sshCa/constants";
import { slugSchema } from "@app/lib/schemas";

const sshCertKeyAlgorithmsArray = sshCertKeyAlgorithms.map((a) => a.value);

const formSchema = z
  .object({
    inputs: z.object({
      principals: z.array(z.string().trim().min(1)).min(1, "At least one principal is required"),
      keyAlgorithm: z.enum(sshCertKeyAlgorithmsArray as [string, ...string[]])
    }),
    defaultTTL: z.string().superRefine((val, ctx) => {
      const valMs = ms(val);
      if (valMs < 60 * 1000)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
      if (valMs > ms("10y"))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
    }),
    maxTTL: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (!val) return;
        const valMs = ms(val);
        if (valMs < 60 * 1000)
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
        if (valMs > ms("10y"))
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
      })
      .nullable(),
    newName: slugSchema({ field: "Name" }).optional()
  })
  .refine((d) => !d.maxTTL || ms(d.maxTTL)! >= ms(d.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  });
type TForm = z.infer<typeof formSchema>;

type Props = {
  onClose: () => void;
  dynamicSecret: TDynamicSecret & { inputs: unknown };
  secretPath: string;
  environment: string;
  projectSlug: string;
};

export const EditDynamicSecretSshForm = ({
  onClose,
  dynamicSecret,
  secretPath,
  environment,
  projectSlug
}: Props) => {
  const sshInputs = dynamicSecret.inputs as {
    caPublicKey?: string;
    principals: string[];
    keyAlgorithm: string;
  };

  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    setValue,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      newName: dynamicSecret.name,
      defaultTTL: dynamicSecret.defaultTTL,
      maxTTL: dynamicSecret.maxTTL,
      inputs: {
        principals: sshInputs.principals || [],
        keyAlgorithm: sshInputs.keyAlgorithm || SshCertKeyAlgorithm.ED25519
      }
    }
  });

  const [principalInput, setPrincipalInput] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);

  const updateDynamicSecret = useUpdateDynamicSecret();

  const principals = watch("inputs.principals");

  const handleUpdateDynamicSecret = async ({ inputs, newName, defaultTTL, maxTTL }: TForm) => {
    if (updateDynamicSecret.isPending) return;
    await updateDynamicSecret.mutateAsync({
      name: dynamicSecret.name,
      path: secretPath,
      projectSlug,
      environmentSlug: environment,
      data: {
        inputs: {
          principals: inputs.principals,
          keyAlgorithm: inputs.keyAlgorithm
        },
        newName: newName === dynamicSecret.name ? undefined : newName,
        defaultTTL,
        maxTTL: maxTTL || undefined
      }
    });
    onClose();
    createNotification({
      type: "success",
      text: "Successfully updated dynamic secret"
    });
  };

  const handleAddPrincipal = () => {
    const trimmed = principalInput.trim();
    if (trimmed && !principals.includes(trimmed)) {
      setValue("inputs.principals", [...principals, trimmed], { shouldValidate: true });
    }
    setPrincipalInput("");
  };

  const handleRemovePrincipal = (idx: number) => {
    setValue(
      "inputs.principals",
      principals.filter((_, i) => i !== idx),
      { shouldValidate: true }
    );
  };

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const setupSshCaCommand = `curl -H "Authorization: Bearer ${getAuthToken()}" "${siteURL}/api/v1/dynamic-secrets/ssh-ca-setup/${dynamicSecret.id}" | sudo bash`;

  return (
    <div>
      <form onSubmit={handleSubmit(handleUpdateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="grow">
              <Controller
                control={control}
                name="newName"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Secret Name"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input {...field} placeholder="dynamic-secret" />
                  </FormControl>
                )}
              />
            </div>
            <div className="w-32">
              <Controller
                control={control}
                name="defaultTTL"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Default TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} />
                  </FormControl>
                )}
              />
            </div>
            <div className="w-32">
              <Controller
                control={control}
                name="maxTTL"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label={<TtlFormLabel label="Max TTL" />}
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                  >
                    <Input {...field} value={field.value || ""} />
                  </FormControl>
                )}
              />
            </div>
          </div>
          <div>
            <div className="mt-4 mb-4 border-b border-border pb-2 pl-1 font-medium text-label">
              Configuration
            </div>

            <div className="flex flex-col">
              <Controller
                control={control}
                name="inputs.principals"
                render={({ fieldState: { error } }) => (
                  <FormControl
                    label="Allowed Principals"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="The usernames this dynamic secret can issue certificates for"
                    isRequired
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={principalInput}
                          onChange={(e) => setPrincipalInput(e.target.value)}
                          placeholder="Enter principal name..."
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddPrincipal();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline_bg"
                          size="sm"
                          onClick={handleAddPrincipal}
                          isDisabled={!principalInput.trim()}
                        >
                          Add
                        </Button>
                      </div>
                      {principals.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {principals.map((principal, idx) => (
                            <Tag
                              className="bg-neutral/15 text-neutral"
                              key={principal}
                              onClose={() => handleRemovePrincipal(idx)}
                            >
                              {principal}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormControl>
                )}
              />

              <Controller
                control={control}
                name="inputs.keyAlgorithm"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Key Algorithm"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="Algorithm for ephemeral key pairs generated per lease"
                  >
                    <Select value={value} onValueChange={onChange} className="w-full">
                      {sshCertKeyAlgorithms.map((alg) => (
                        <SelectItem key={alg.value} value={alg.value}>
                          {alg.label}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </div>

            <button
              type="button"
              onClick={() => setCmdOpen(!cmdOpen)}
              className="flex w-full cursor-pointer flex-col rounded-md border border-border bg-container p-3 text-sm hover:bg-container-hover"
            >
              <div className="flex gap-2.5">
                <ShieldIcon className="mt-0.5 size-6 shrink-0 text-info" />
                <div className="flex w-full flex-col">
                  <div className="flex justify-between gap-2 pr-1">
                    <div className="flex flex-col text-left">
                      <span className="text-base">Certificate-Based Authentication</span>
                      <span className="text-sm text-muted">
                        Run this command on target hosts to trust certificates from this dynamic
                        secret
                      </span>
                    </div>
                    <ChevronDownIcon
                      className={twMerge(
                        "shrink-0 text-muted transition-transform duration-200 ease-in-out",
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
                        <span className="mt-2 text-sm text-muted">
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
                            <FontAwesomeIcon icon={faCopy} className="text-label" />
                          </IconButton>
                        </div>
                        <div className="mt-4 flex flex-col gap-1 text-xs text-muted">
                          <span>This command will:</span>
                          <span>- Install the CA certificate on the target host</span>
                          <span>- Configure SSH to trust certificate-based authentication</span>
                          <span>- Restart the SSH service</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
