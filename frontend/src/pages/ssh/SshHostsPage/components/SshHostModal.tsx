import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faChevronDown, faChevronRight, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import {
  useCreateSshHost,
  useGetSshHostById,
  useGetWorkspaceUsers,
  useListWorkspaceGroups,
  useListWorkspaceSshHosts,
  useUpdateSshHost
} from "@app/hooks/api";
import { LoginMappingSource } from "@app/hooks/api/sshHost/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["sshHost"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["sshHost"]>, state?: boolean) => void;
};

const schema = z
  .object({
    hostname: z.string().trim(),
    alias: z.string().trim(),
    userCertTtl: z
      .string()
      .trim()
      .refine(
        (val) => ms(val) > 0,
        "TTL must be a valid time string such as 2 days, 1d, 2h 1y, ..."
      )
      .default("8h"),
    loginMappings: z
      .object({
        loginUser: z.string().trim().min(1),
        allowedPrincipals: z
          .array(
            z.object({
              type: z.enum(["user", "group"]),
              value: z.string().trim().min(1)
            })
          )
          .default([]),
        source: z.nativeEnum(LoginMappingSource)
      })
      .array()
      .default([])
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const SshHostModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { data: sshHosts } = useListWorkspaceSshHosts(currentWorkspace.id);
  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const { data: groups = [] } = useListWorkspaceGroups(projectId);
  const [expandedMappings, setExpandedMappings] = useState<Record<number, boolean>>({});

  const { data: sshHost } = useGetSshHostById(
    (popUp?.sshHost?.data as { sshHostId: string })?.sshHostId || ""
  );

  const { mutateAsync: createMutateAsync } = useCreateSshHost();
  const { mutateAsync: updateMutateAsync } = useUpdateSshHost();

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      hostname: "",
      alias: "",
      userCertTtl: "8h",
      loginMappings: []
    }
  });

  const loginMappingsFormFields = useFieldArray({
    control,
    name: "loginMappings"
  });

  useEffect(() => {
    if (sshHost) {
      reset({
        hostname: sshHost.hostname,
        alias: sshHost.alias ?? "",
        userCertTtl: sshHost.userCertTtl,
        loginMappings: sshHost.loginMappings.map(({ loginUser, allowedPrincipals, source }) => ({
          loginUser,
          allowedPrincipals: [
            ...(allowedPrincipals.usernames || []).map((username) => ({
              type: "user" as const,
              value: username
            })),
            ...(allowedPrincipals.groups || []).map((group) => ({
              type: "group" as const,
              value: group
            }))
          ],
          source
        }))
      });

      setExpandedMappings(
        Object.fromEntries(sshHost.loginMappings.map((_, index) => [index, false]))
      );
    } else {
      reset({
        hostname: "",
        alias: "",
        userCertTtl: "8h",
        loginMappings: []
      });
    }
  }, [sshHost]);

  const onFormSubmit = async ({ hostname, alias, userCertTtl, loginMappings }: FormData) => {
    try {
      if (!projectId) return;

      // Filter out login mappings that are from host groups
      const hostLoginMappings = loginMappings.filter(
        (mapping) => mapping.source === LoginMappingSource.HOST
      );

      // check if there is already a different host with the same hostname
      const existingHostnames =
        sshHosts?.filter((h) => h.id !== sshHost?.id).map((h) => h.hostname) || [];

      if (existingHostnames.includes(hostname.trim())) {
        createNotification({
          text: "A host with this hostname already exists.",
          type: "error"
        });
        return;
      }

      const trimmedAlias = alias.trim();

      // check if there is already a different host with the same non-null alias
      if (trimmedAlias) {
        const existingAliases =
          sshHosts?.filter((h) => h.id !== sshHost?.id && h.alias !== null).map((h) => h.alias) ||
          [];

        if (existingAliases.includes(trimmedAlias)) {
          createNotification({
            text: "A host with this alias already exists.",
            type: "error"
          });
          return;
        }
      }

      const transformedLoginMappings = hostLoginMappings.map(({ loginUser, allowedPrincipals }) => {
        const usernames = allowedPrincipals
          .filter((p) => p.type === "user" && p.value)
          .map((p) => p.value);

        const groupNames = allowedPrincipals
          .filter((p) => p.type === "group" && p.value)
          .map((p) => p.value);

        return {
          loginUser,
          allowedPrincipals: {
            usernames,
            groups: groupNames
          }
        };
      });

      if (sshHost) {
        await updateMutateAsync({
          sshHostId: sshHost.id,
          hostname,
          alias: trimmedAlias,
          userCertTtl,
          loginMappings: transformedLoginMappings
        });
      } else {
        await createMutateAsync({
          projectId,
          hostname,
          alias: trimmedAlias,
          userCertTtl,
          loginMappings: transformedLoginMappings
        });
      }

      reset();
      handlePopUpToggle("sshHost", false);

      createNotification({
        text: `Successfully ${sshHost ? "updated" : "added"} SSH host`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${sshHost ? "update" : "add"} SSH host`,
        type: "error"
      });
    }
  };

  const toggleMapping = (index: number) => {
    setExpandedMappings((prev) => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const isPrincipalDuplicate = (
    mappingIndex: number,
    principalType: string,
    principalValue: string
  ) => {
    const principals = getValues(`loginMappings.${mappingIndex}.allowedPrincipals`) || [];
    return principals.some((p) => p.type === principalType && p.value === principalValue);
  };

  return (
    <Modal
      isOpen={popUp?.sshHost?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("sshHost", isOpen);
      }}
    >
      <ModalContent title={`${sshHost ? "View" : "Add"} SSH host`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {sshHost && (
            <FormControl label="SSH Host ID">
              <Input value={sshHost.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            defaultValue=""
            name="hostname"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Hostname"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="host.example.com" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="alias"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Alias" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="host" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="userCertTtl"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="User Certificate TTL"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="8h, 1d, 30m" />
              </FormControl>
            )}
          />
          <div className="mb-4 flex items-center justify-between">
            <FormLabel label="Login Mappings" />
            <Button
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              size="xs"
              variant="outline_bg"
              onClick={() => {
                const newIndex = loginMappingsFormFields.fields.length;
                loginMappingsFormFields.append({
                  loginUser: "",
                  allowedPrincipals: [],
                  source: LoginMappingSource.HOST
                });
                setExpandedMappings((prev) => ({
                  ...prev,
                  [newIndex]: true
                }));
              }}
            >
              Add Login Mapping
            </Button>
          </div>
          <div className="mb-4 flex flex-col space-y-4">
            {loginMappingsFormFields.fields.map(({ id: metadataFieldId }, i) => (
              <div
                key={metadataFieldId}
                className="flex flex-col space-y-2 rounded-md border border-mineshaft-600 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    className="flex cursor-pointer items-center py-1 text-sm text-mineshaft-200"
                    onClick={() => toggleMapping(i)}
                  >
                    <FontAwesomeIcon
                      icon={expandedMappings[i] ? faChevronDown : faChevronRight}
                      className="mr-4"
                      size="sm"
                    />
                    <Controller
                      control={control}
                      name={`loginMappings.${i}.loginUser`}
                      render={({ field }) => (
                        <span className="text-sm font-medium leading-tight">
                          {field.value || "New Login Mapping"}
                          {loginMappingsFormFields.fields[i].source ===
                            LoginMappingSource.HOST_GROUP && (
                            <span className="ml-2 text-xs text-mineshaft-400">
                              (inherited from host group)
                            </span>
                          )}
                        </span>
                      )}
                    />
                  </button>
                  <IconButton
                    ariaLabel="delete login mapping"
                    variant="plain"
                    onClick={() => loginMappingsFormFields.remove(i)}
                    isDisabled={
                      loginMappingsFormFields.fields[i].source === LoginMappingSource.HOST_GROUP
                    }
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </div>

                {expandedMappings[i] && (
                  <>
                    <div>
                      <span className="text-xs text-mineshaft-400">Login User</span>
                      <Controller
                        control={control}
                        name={`loginMappings.${i}.loginUser`}
                        render={({ field, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            className="mb-0"
                          >
                            <Input
                              {...field}
                              placeholder="ec2-user"
                              isDisabled={
                                loginMappingsFormFields.fields[i].source ===
                                LoginMappingSource.HOST_GROUP
                              }
                              onChange={(e) => {
                                if (
                                  loginMappingsFormFields.fields[i].source ===
                                  LoginMappingSource.HOST_GROUP
                                )
                                  return;

                                const newValue = e.target.value;
                                const loginMappings = getValues("loginMappings");
                                const isDuplicate = loginMappings.some(
                                  (mapping, index) =>
                                    index !== i &&
                                    mapping.loginUser === newValue &&
                                    mapping.source === LoginMappingSource.HOST
                                );

                                if (isDuplicate) {
                                  createNotification({
                                    text: "This login user already exists",
                                    type: "error"
                                  });
                                  return;
                                }

                                field.onChange(e);
                              }}
                            />
                          </FormControl>
                        )}
                      />
                    </div>
                    <div className="flex flex-col space-y-2">
                      <div className="mb-2 mt-4 flex items-center justify-between">
                        <FormLabel
                          label="Allowed Principals"
                          className="text-xs text-mineshaft-400"
                        />
                        {loginMappingsFormFields.fields[i].source === LoginMappingSource.HOST && (
                          <Button
                            leftIcon={<FontAwesomeIcon icon={faPlus} />}
                            size="xs"
                            variant="outline_bg"
                            onClick={() => {
                              const current =
                                getValues(`loginMappings.${i}.allowedPrincipals`) ?? [];
                              setValue(`loginMappings.${i}.allowedPrincipals`, [
                                ...current,
                                { type: "user", value: "" }
                              ]);
                            }}
                          >
                            Add Principal
                          </Button>
                        )}
                      </div>
                      <Controller
                        control={control}
                        name={`loginMappings.${i}.allowedPrincipals`}
                        render={({ field: { value = [], onChange }, fieldState: { error } }) => (
                          <div className="flex flex-col space-y-2">
                            {value.map((principal, principalIndex) => (
                              <div
                                key={`principal-${i + 1}-${principalIndex + 1}-${principal.type}`}
                                className="flex items-center space-x-2"
                              >
                                <div className="mr-2">
                                  <Select
                                    className="w-24"
                                    value={principal.type}
                                    onValueChange={(newType) => {
                                      const newPrincipals = [...value];
                                      newPrincipals[principalIndex] = {
                                        type: newType as "user" | "group",
                                        value: ""
                                      };
                                      onChange(newPrincipals);
                                    }}
                                    isDisabled={
                                      loginMappingsFormFields.fields[i].source ===
                                      LoginMappingSource.HOST_GROUP
                                    }
                                  >
                                    <SelectItem value="user">User</SelectItem>
                                    <SelectItem value="group">Group</SelectItem>
                                  </Select>
                                </div>
                                <div className="flex-1">
                                  <Select
                                    value={principal.value}
                                    onValueChange={(newValue) => {
                                      if (
                                        loginMappingsFormFields.fields[i].source ===
                                        LoginMappingSource.HOST_GROUP
                                      )
                                        return;
                                      if (isPrincipalDuplicate(i, principal.type, newValue)) {
                                        createNotification({
                                          text: `This ${principal.type} is already added`,
                                          type: "error"
                                        });
                                        return;
                                      }
                                      const newPrincipals = [...value];
                                      newPrincipals[principalIndex] = {
                                        type: principal.type,
                                        value: newValue
                                      };
                                      onChange(newPrincipals);
                                    }}
                                    placeholder={`Select a ${principal.type}`}
                                    className="w-full"
                                    isDisabled={
                                      loginMappingsFormFields.fields[i].source ===
                                      LoginMappingSource.HOST_GROUP
                                    }
                                  >
                                    {principal.type === "user"
                                      ? members.map((member) => (
                                          <SelectItem
                                            key={member.user.id}
                                            value={member.user.username}
                                          >
                                            {member.user.username}
                                          </SelectItem>
                                        ))
                                      : groups.map((group) => (
                                          <SelectItem
                                            key={group.group.slug}
                                            value={group.group.slug}
                                          >
                                            {group.group.slug}
                                          </SelectItem>
                                        ))}
                                  </Select>
                                </div>
                                <div className="flex w-10 justify-center">
                                  <IconButton
                                    size="sm"
                                    ariaLabel="delete principal"
                                    variant="plain"
                                    className="h-9"
                                    onClick={() => {
                                      if (
                                        loginMappingsFormFields.fields[i].source ===
                                        LoginMappingSource.HOST_GROUP
                                      )
                                        return;

                                      const newPrincipals = value.filter(
                                        (_, idx) => idx !== principalIndex
                                      );
                                      onChange([...newPrincipals]);
                                    }}
                                    isDisabled={
                                      loginMappingsFormFields.fields[i].source ===
                                      LoginMappingSource.HOST_GROUP
                                    }
                                  >
                                    <FontAwesomeIcon icon={faTrash} />
                                  </IconButton>
                                </div>
                              </div>
                            ))}
                            {error && <span className="text-sm text-red-500">{error.message}</span>}
                          </div>
                        )}
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              {popUp?.sshHost?.data ? "Update" : "Add"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("sshHost", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
