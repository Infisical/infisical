import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { faChevronDown, faChevronRight, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
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
  useCreateSshHostGroup,
  useGetSshHostGroupById,
  useGetWorkspaceUsers,
  useListWorkspaceSshHostGroups,
  useUpdateSshHostGroup
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["sshHostGroup"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["sshHostGroup"]>, state?: boolean) => void;
};

const schema = z
  .object({
    name: z.string().trim().min(1).max(64),
    loginMappings: z
      .object({
        loginUser: z.string().trim().min(1),
        allowedPrincipals: z.array(z.string().trim()).default([])
      })
      .array()
      .default([])
  })
  .required();

export type FormData = z.infer<typeof schema>;

export const SshHostGroupModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { data: sshHostGroups } = useListWorkspaceSshHostGroups(currentWorkspace.id);
  const { data: members = [] } = useGetWorkspaceUsers(projectId);
  const [expandedMappings, setExpandedMappings] = useState<Record<number, boolean>>({});

  const { data: sshHostGroup } = useGetSshHostGroupById(
    (popUp?.sshHostGroup?.data as { sshHostGroupId: string })?.sshHostGroupId || ""
  );

  const { mutateAsync: createMutateAsync } = useCreateSshHostGroup();
  const { mutateAsync: updateMutateAsync } = useUpdateSshHostGroup();

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
      name: "",
      loginMappings: []
    }
  });

  const loginMappingsFormFields = useFieldArray({
    control,
    name: "loginMappings"
  });

  useEffect(() => {
    if (sshHostGroup) {
      reset({
        name: sshHostGroup.name,
        loginMappings: sshHostGroup.loginMappings.map(({ loginUser, allowedPrincipals }) => ({
          loginUser,
          allowedPrincipals: allowedPrincipals.usernames
        }))
      });

      setExpandedMappings(
        Object.fromEntries(sshHostGroup.loginMappings.map((_, index) => [index, false]))
      );
    } else {
      reset({
        name: "",
        loginMappings: []
      });
    }
  }, [sshHostGroup]);

  const onFormSubmit = async ({ name, loginMappings }: FormData) => {
    try {
      if (!projectId) return;

      // check if there is already a different host group with the same name
      const existingNames =
        sshHostGroups?.filter((h) => h.id !== sshHostGroup?.id).map((h) => h.name) || [];

      if (existingNames.includes(name.trim())) {
        createNotification({
          text: "A host group with this name already exists.",
          type: "error"
        });
        return;
      }

      if (sshHostGroup) {
        await updateMutateAsync({
          sshHostGroupId: sshHostGroup.id,
          name,
          loginMappings: loginMappings.map(({ loginUser, allowedPrincipals }) => ({
            loginUser,
            allowedPrincipals: {
              usernames: allowedPrincipals
            }
          }))
        });
      } else {
        await createMutateAsync({
          projectId,
          name,
          loginMappings: loginMappings.map(({ loginUser, allowedPrincipals }) => ({
            loginUser,
            allowedPrincipals: {
              usernames: allowedPrincipals
            }
          }))
        });
      }

      reset();
      handlePopUpToggle("sshHostGroup", false);

      createNotification({
        text: `Successfully ${sshHostGroup ? "updated" : "created"} SSH host group`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: `Failed to ${sshHostGroup ? "update" : "create"} SSH host group`,
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

  return (
    <Modal
      isOpen={popUp?.sshHostGroup?.isOpen}
      onOpenChange={(isOpen) => {
        reset();
        handlePopUpToggle("sshHostGroup", isOpen);
      }}
    >
      <ModalContent title={`${sshHostGroup ? "View" : "Add"} SSH host group`}>
        <form onSubmit={handleSubmit(onFormSubmit)}>
          {sshHostGroup && (
            <FormControl label="SSH Host Group ID">
              <Input value={sshHostGroup.id} isDisabled className="bg-white/[0.07]" />
            </FormControl>
          )}
          <Controller
            control={control}
            defaultValue=""
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Name"
                isError={Boolean(error)}
                errorText={error?.message}
                isRequired
              >
                <Input {...field} placeholder="production" />
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
                loginMappingsFormFields.append({ loginUser: "", allowedPrincipals: [""] });
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
                        </span>
                      )}
                    />
                  </button>
                  <IconButton
                    ariaLabel="delete login mapping"
                    variant="plain"
                    onClick={() => loginMappingsFormFields.remove(i)}
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
                              onChange={(e) => {
                                const newValue = e.target.value;
                                const loginMappings = getValues("loginMappings");
                                const isDuplicate = loginMappings.some(
                                  (mapping, index) => index !== i && mapping.loginUser === newValue
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
                        <Button
                          leftIcon={<FontAwesomeIcon icon={faPlus} />}
                          size="xs"
                          variant="outline_bg"
                          onClick={() => {
                            const current = getValues(`loginMappings.${i}.allowedPrincipals`) ?? [];
                            setValue(`loginMappings.${i}.allowedPrincipals`, [...current, ""]);
                          }}
                        >
                          Add Principal
                        </Button>
                      </div>
                      <Controller
                        control={control}
                        name={`loginMappings.${i}.allowedPrincipals`}
                        render={({ field: { value = [], onChange }, fieldState: { error } }) => (
                          <div className="flex flex-col space-y-2">
                            {(value.length === 0 ? [""] : value).map(
                              (principal: string, principalIndex: number) => (
                                <div
                                  key={`${metadataFieldId}-principal-${principal}`}
                                  className="flex items-center space-x-2"
                                >
                                  <div className="flex-1">
                                    <Select
                                      value={principal}
                                      onValueChange={(newValue) => {
                                        if (value.includes(newValue)) {
                                          createNotification({
                                            text: "This principal is already added",
                                            type: "error"
                                          });
                                          return;
                                        }
                                        const newPrincipals = [...value];
                                        newPrincipals[principalIndex] = newValue;
                                        onChange(newPrincipals);
                                      }}
                                      placeholder="Select a member"
                                      className="w-full"
                                    >
                                      {members.map((member) => (
                                        <SelectItem
                                          key={member.user.id}
                                          value={member.user.username}
                                        >
                                          {member.user.username}
                                        </SelectItem>
                                      ))}
                                    </Select>
                                  </div>
                                  <IconButton
                                    size="sm"
                                    ariaLabel="delete principal"
                                    variant="plain"
                                    className="h-9"
                                    onClick={() => {
                                      const newPrincipals = value.filter(
                                        (_, idx) => idx !== principalIndex
                                      );
                                      onChange(newPrincipals);
                                    }}
                                  >
                                    <FontAwesomeIcon icon={faTrash} />
                                  </IconButton>
                                </div>
                              )
                            )}
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
              {popUp?.sshHostGroup?.data ? "Update" : "Add"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpToggle("sshHostGroup", false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
