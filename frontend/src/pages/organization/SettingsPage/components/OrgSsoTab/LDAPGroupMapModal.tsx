import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DeleteActionModal,
  EmptyState,
  FormControl,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import {
  useCreateLDAPGroupMapping,
  useDeleteLDAPGroupMapping,
  useGetLDAPConfig,
  useGetLDAPGroupMaps,
  useGetOrganizationGroups
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  ldapGroupCN: z.string().min(1, "LDAP Group CN is required"),
  groupSlug: z.string().min(1, "Group Slug is required")
});

export type TFormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["ldapGroupMap", "deleteLdapGroupMap"]>;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteLdapGroupMap"]>,
    data?: {
      ldapGroupMapId: string;
      ldapGroupCN: string;
    }
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["ldapGroupMap", "deleteLdapGroupMap"]>,
    state?: boolean
  ) => void;
};

export const LDAPGroupMapModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();

  const { data: ldapConfig } = useGetLDAPConfig(currentOrg?.id ?? "");
  const { data: groups } = useGetOrganizationGroups(currentOrg?.id ?? "");
  const { data: groupMaps, isPending } = useGetLDAPGroupMaps(ldapConfig?.id ?? "");
  const { mutateAsync: createLDAPGroupMapping, isPending: createIsLoading } =
    useCreateLDAPGroupMapping();
  const { mutateAsync: deleteLDAPGroupMapping } = useDeleteLDAPGroupMapping();
  const navigate = useNavigate();

  const { control, handleSubmit, reset, setValue } = useForm<TFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ldapGroupCN: "",
      groupSlug: ""
    }
  });

  const onFormSubmit = async ({ groupSlug, ldapGroupCN }: TFormData) => {
    if (!ldapConfig) return;

    await createLDAPGroupMapping({
      ldapConfigId: ldapConfig.id,
      groupSlug,
      ldapGroupCN
    });

    reset();

    createNotification({
      text: `Successfully added LDAP group mapping for ${ldapGroupCN}`,
      type: "success"
    });
  };

  const onDeleteGroupMapSubmit = async ({
    ldapConfigId,
    ldapGroupMapId,
    ldapGroupCN
  }: {
    ldapConfigId: string;
    ldapGroupMapId: string;
    ldapGroupCN: string;
  }) => {
    await deleteLDAPGroupMapping({
      ldapConfigId,
      ldapGroupMapId
    });

    handlePopUpToggle("deleteLdapGroupMap", false);

    createNotification({
      text: `Successfully deleted LDAP group mapping ${ldapGroupCN}`,
      type: "success"
    });
  };

  useEffect(() => {
    if (groups && groups.length > 0) {
      setValue("groupSlug", groups[0].slug);
    }
  }, [groups, popUp.ldapGroupMap.isOpen]);

  return (
    <Modal
      isOpen={popUp?.ldapGroupMap?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("ldapGroupMap", isOpen);
        reset();
      }}
    >
      <ModalContent title="Manage LDAP Group Mappings">
        {groups && groups.length > 0 && (
          <>
            <h2 className="mb-4">New Group Mapping</h2>
            <form onSubmit={handleSubmit(onFormSubmit)} className="mb-8">
              <div className="flex">
                <Controller
                  control={control}
                  name="ldapGroupCN"
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      label="LDAP Group CN"
                      errorText={error?.message}
                      isError={Boolean(error)}
                    >
                      <Input {...field} placeholder="Engineering" />
                    </FormControl>
                  )}
                />
                <Controller
                  control={control}
                  name="groupSlug"
                  defaultValue=""
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => (
                    <FormControl
                      label="Infisical Group"
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="ml-4 w-full"
                    >
                      <div className="flex">
                        <Select
                          defaultValue={field.value}
                          {...field}
                          onValueChange={(e) => onChange(e)}
                          className="w-full"
                        >
                          {(groups || []).map(({ name, id, slug }) => (
                            <SelectItem value={slug} key={`internal-group-${id}`}>
                              {name}
                            </SelectItem>
                          ))}
                        </Select>
                        <Button
                          className="ml-4"
                          size="sm"
                          type="submit"
                          isLoading={createIsLoading}
                        >
                          Add mapping
                        </Button>
                      </div>
                    </FormControl>
                  )}
                />
              </div>
            </form>
            <h2 className="mb-4">Group Mappings</h2>
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th>LDAP Group CN</Th>
                    <Th>Infisical Group</Th>
                    <Th className="w-5" />
                  </Tr>
                </THead>
                <TBody>
                  {isPending && <TableSkeleton columns={3} innerKey="ldap-group-maps" />}
                  {!isPending &&
                    groupMaps?.map(({ id, ldapGroupCN, group }) => {
                      return (
                        <Tr className="h-10 items-center" key={`ldap-group-map-${id}`}>
                          <Td>{ldapGroupCN}</Td>
                          <Td>{group.name}</Td>
                          <Td>
                            <IconButton
                              onClick={() => {
                                handlePopUpOpen("deleteLdapGroupMap", {
                                  ldapGroupMapId: id,
                                  ldapGroupCN
                                });
                              }}
                              size="lg"
                              colorSchema="danger"
                              variant="plain"
                              ariaLabel="update"
                            >
                              <FontAwesomeIcon icon={faXmark} />
                            </IconButton>
                          </Td>
                        </Tr>
                      );
                    })}
                </TBody>
              </Table>
              {groupMaps?.length === 0 && (
                <EmptyState title="No LDAP group mappings found" icon={faUsers} />
              )}
            </TableContainer>
            <DeleteActionModal
              isOpen={popUp.deleteLdapGroupMap.isOpen}
              title={`Are you sure you want to delete the group mapping for ${
                (popUp?.deleteLdapGroupMap?.data as { ldapGroupCN: string })?.ldapGroupCN || ""
              }?`}
              onChange={(isOpen) => handlePopUpToggle("deleteLdapGroupMap", isOpen)}
              deleteKey="confirm"
              onDeleteApproved={() => {
                const deleteLdapGroupMapData = popUp?.deleteLdapGroupMap?.data as {
                  ldapGroupMapId: string;
                  ldapGroupCN: string;
                };
                return onDeleteGroupMapSubmit({
                  ldapConfigId: ldapConfig?.id ?? "",
                  ldapGroupMapId: deleteLdapGroupMapData.ldapGroupMapId,
                  ldapGroupCN: deleteLdapGroupMapData.ldapGroupCN
                });
              }}
            />
          </>
        )}
        {groups && groups.length === 0 && (
          <div>
            <div>
              You do not have any Infisical groups in your organization. Create one in order to
              proceed.
            </div>
            <Button
              className="mt-4"
              size="sm"
              onClick={() =>
                navigate({
                  to: "/organizations/$orgId/access-management",
                  params: { orgId: currentOrg.id }
                })
              }
            >
              Create
            </Button>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
