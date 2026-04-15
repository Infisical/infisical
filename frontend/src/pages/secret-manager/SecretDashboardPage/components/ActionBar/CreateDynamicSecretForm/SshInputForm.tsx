import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCopy } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import ms from "ms";
import { z } from "zod";

import { TtlFormLabel } from "@app/components/features";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Tag
} from "@app/components/v2";
import { useCreateDynamicSecret, useGetSshCaPublicKey } from "@app/hooks/api";
import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";
import { getAuthToken } from "@app/hooks/api/reactQuery";
import { SshCertKeyAlgorithm, sshCertKeyAlgorithms } from "@app/hooks/api/sshCa/constants";
import { ProjectEnv } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

const sshCertKeyAlgorithmsArray = sshCertKeyAlgorithms.map((a) => a.value);

const formSchema = z
  .object({
    provider: z.object({
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
    name: slugSchema({ field: "Name" }),
    environment: z.object({ name: z.string(), slug: z.string() })
  })
  .refine((d) => !d.maxTTL || ms(d.maxTTL)! >= ms(d.defaultTTL)!, {
    path: ["maxTTL"],
    message: "Max TTL must be greater than or equal to Default TTL"
  });
type TForm = z.infer<typeof formSchema>;

type Props = {
  onCompleted: () => void;
  onCancel: () => void;
  secretPath: string;
  projectSlug: string;
  environments: ProjectEnv[];
  isSingleEnvironmentMode?: boolean;
};

export const SshInputForm = ({
  onCompleted,
  onCancel,
  environments,
  secretPath,
  projectSlug,
  isSingleEnvironmentMode
}: Props) => {
  const {
    control,
    formState: { isSubmitting },
    handleSubmit,
    setValue,
    watch
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: {
        principals: [],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519
      },
      defaultTTL: "1h",
      maxTTL: "24h",
      environment: isSingleEnvironmentMode && environments.length > 0 ? environments[0] : undefined
    }
  });

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [createdDynamicSecretId, setCreatedDynamicSecretId] = useState<string | null>(null);
  const [principalInput, setPrincipalInput] = useState("");
  const [isPublicKeyVisible, setIsPublicKeyVisible] = useState(false);

  const { data: caPublicKey } = useGetSshCaPublicKey({
    dynamicSecretId: createdDynamicSecretId || "",
    enabled: showSetupModal && !!createdDynamicSecretId
  });

  const createDynamicSecret = useCreateDynamicSecret();

  const principals = watch("provider.principals");

  const handleCreateDynamicSecret = async ({
    name,
    provider,
    defaultTTL,
    maxTTL,
    environment
  }: TForm) => {
    if (createDynamicSecret.isPending) return;
    const result = await createDynamicSecret.mutateAsync({
      provider: {
        type: DynamicSecretProviders.Ssh,
        inputs: {
          principals: provider.principals,
          keyAlgorithm: provider.keyAlgorithm
        }
      },
      defaultTTL,
      maxTTL: maxTTL || undefined,
      name,
      path: secretPath,
      projectSlug,
      environmentSlug: environment.slug
    });

    const dynamicSecret = result as { id: string };
    setCreatedDynamicSecretId(dynamicSecret.id);
    setShowSetupModal(true);
  };

  const handleAddPrincipal = () => {
    const trimmed = principalInput.trim();
    if (trimmed && !principals.includes(trimmed)) {
      setValue("provider.principals", [...principals, trimmed], { shouldValidate: true });
    }
    setPrincipalInput("");
  };

  const handleRemovePrincipal = (idx: number) => {
    setValue(
      "provider.principals",
      principals.filter((_, i) => i !== idx),
      { shouldValidate: true }
    );
  };

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" ? `:${port}` : "";
  const siteURL = `${protocol}//${hostname}${portSuffix}`;

  const setupCommand = createdDynamicSecretId
    ? `curl -H "Authorization: Bearer ${getAuthToken()}" "${siteURL}/api/v1/dynamic-secrets/ssh-ca-setup/${createdDynamicSecretId}" | sudo bash`
    : "";

  return (
    <div>
      <form onSubmit={handleSubmit(handleCreateDynamicSecret)} autoComplete="off">
        <div>
          <div className="flex items-center space-x-2">
            <div className="grow">
              <Controller
                control={control}
                defaultValue=""
                name="name"
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
                name="provider.principals"
                render={({ fieldState: { error } }) => (
                  <FormControl
                    label="Allowed Principals"
                    isError={Boolean(error?.message)}
                    errorText={error?.message}
                    helperText="The usernames this dynamic secret can issue certificates for (e.g., deploy, ubuntu, root)"
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
                name="provider.keyAlgorithm"
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

            {!isSingleEnvironmentMode && (
              <Controller
                control={control}
                name="environment"
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <FormControl
                    label="Environment"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <FilterableSelect
                      options={environments}
                      value={value}
                      onChange={onChange}
                      placeholder="Select the environment to create secret in..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                      menuPlacement="top"
                    />
                  </FormControl>
                )}
              />
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center space-x-4">
          <Button type="submit" isLoading={isSubmitting}>
            Submit
          </Button>
          <Button variant="outline_bg" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>

      <Modal
        isOpen={showSetupModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowSetupModal(false);
            onCompleted();
          }
        }}
      >
        <ModalContent
          className="max-w-2xl"
          title="Certificate Authentication Setup"
          subTitle="Configure the target host to trust certificates issued by this dynamic secret."
        >
          <div className="flex flex-col">
            <span className="text-sm text-muted">Run this command on the target host:</span>
            <div className="mt-2 flex items-center gap-1">
              <Input value={setupCommand} isDisabled />
              <IconButton
                ariaLabel="copy"
                variant="plain"
                colorSchema="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(setupCommand);
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
            <div className="mt-4 flex flex-col gap-1 text-sm text-muted">
              <span>This command will:</span>
              <span>- Install the CA certificate on the target host</span>
              <span>- Configure SSH to trust certificate-based authentication</span>
              <span>- Restart the SSH service</span>
            </div>
            <span className="mt-4 text-sm text-muted">
              Or, copy the CA public key to install it manually:
            </span>
            <div className="mt-2 flex items-center gap-1">
              <Input
                type={isPublicKeyVisible ? "text" : "password"}
                value={caPublicKey || ""}
                isDisabled
              />
              <IconButton
                ariaLabel="toggle visibility"
                variant="plain"
                colorSchema="secondary"
                size="sm"
                onClick={() => setIsPublicKeyVisible((v) => !v)}
                className="size-8 shrink-0"
              >
                {isPublicKeyVisible ? (
                  <EyeOffIcon className="size-4 text-label" />
                ) : (
                  <EyeIcon className="size-4 text-label" />
                )}
              </IconButton>
              <IconButton
                ariaLabel="copy"
                variant="plain"
                colorSchema="secondary"
                size="sm"
                onClick={() => {
                  if (caPublicKey) {
                    navigator.clipboard.writeText(caPublicKey);
                    createNotification({
                      text: "CA public key copied to clipboard",
                      type: "info"
                    });
                  }
                }}
                className="size-8 shrink-0"
              >
                <FontAwesomeIcon icon={faCopy} className="text-label" />
              </IconButton>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              colorSchema="secondary"
              onClick={() => {
                setShowSetupModal(false);
                onCompleted();
              }}
            >
              Close
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
};
