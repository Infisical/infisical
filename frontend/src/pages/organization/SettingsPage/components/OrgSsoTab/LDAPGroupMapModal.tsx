import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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
    <>
      <Sheet
        open={popUp?.ldapGroupMap?.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("ldapGroupMap", isOpen);
          reset();
        }}
      >
        <SheetContent className="sm:max-w-2xl">
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader>
              <SheetTitle>Manage LDAP Group Mappings</SheetTitle>
            </SheetHeader>
            <div className="thin-scrollbar flex-1 overflow-y-auto px-4 py-4">
              {groups && groups.length > 0 && (
                <>
                  <form onSubmit={handleSubmit(onFormSubmit)} className="mb-6">
                    <div className="flex items-end gap-3">
                      <Controller
                        control={control}
                        name="ldapGroupCN"
                        render={({ field, fieldState: { error } }) => (
                          <Field className="flex-1">
                            <FieldLabel htmlFor="ldap-group-cn">LDAP Group CN</FieldLabel>
                            <Input
                              id="ldap-group-cn"
                              placeholder="Engineering"
                              isError={Boolean(error)}
                              {...field}
                            />
                            <FieldError>{error?.message}</FieldError>
                          </Field>
                        )}
                      />
                      <Controller
                        control={control}
                        name="groupSlug"
                        defaultValue=""
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <Field className="flex-1">
                            <FieldLabel htmlFor="ldap-group-slug">Infisical Group</FieldLabel>
                            <Select value={value} onValueChange={onChange}>
                              <SelectTrigger
                                id="ldap-group-slug"
                                isError={Boolean(error)}
                                className="w-full"
                              >
                                <SelectValue placeholder="Select group" />
                              </SelectTrigger>
                              <SelectContent>
                                {(groups || []).map(({ name, id, slug }) => (
                                  <SelectItem value={slug} key={`internal-group-${id}`}>
                                    {name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FieldError>{error?.message}</FieldError>
                          </Field>
                        )}
                      />
                      <Button type="submit" variant="org" isPending={createIsLoading}>
                        Add Mapping
                      </Button>
                    </div>
                  </form>
                  {(isPending || (groupMaps && groupMaps.length > 0)) && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>LDAP Group CN</TableHead>
                          <TableHead>Infisical Group</TableHead>
                          <TableHead className="w-px text-right" aria-label="Actions" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {isPending &&
                          Array.from({ length: 3 }).map((_, idx) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <TableRow key={`ldap-group-map-skeleton-${idx}`}>
                              <TableCell colSpan={3}>
                                <Skeleton className="h-5 w-full" />
                              </TableCell>
                            </TableRow>
                          ))}
                        {!isPending &&
                          groupMaps?.map(({ id, ldapGroupCN, group }) => (
                            <TableRow key={`ldap-group-map-${id}`}>
                              <TableCell className="font-medium text-foreground">
                                {ldapGroupCN}
                              </TableCell>
                              <TableCell>{group.name}</TableCell>
                              <TableCell className="text-right">
                                <IconButton
                                  variant="ghost"
                                  size="xs"
                                  aria-label={`Delete mapping for ${ldapGroupCN}`}
                                  onClick={() =>
                                    handlePopUpOpen("deleteLdapGroupMap", {
                                      ldapGroupMapId: id,
                                      ldapGroupCN
                                    })
                                  }
                                >
                                  <Trash2 />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                  {!isPending && groupMaps?.length === 0 && (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyTitle>No LDAP group mappings</EmptyTitle>
                        <EmptyDescription>
                          Add a mapping above to assign LDAP groups to Infisical groups.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </>
              )}
              {groups && groups.length === 0 && (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyTitle>No Infisical groups</EmptyTitle>
                    <EmptyDescription>
                      Create an Infisical group in your organization before mapping LDAP groups.
                    </EmptyDescription>
                    <EmptyContent>
                      <Button
                        variant="org"
                        onClick={() =>
                          navigate({
                            to: "/organizations/$orgId/access-management",
                            params: { orgId: currentOrg.id }
                          })
                        }
                      >
                        Create group
                      </Button>
                    </EmptyContent>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={popUp.deleteLdapGroupMap.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteLdapGroupMap", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>
              Delete group mapping for &quot;
              {(popUp?.deleteLdapGroupMap?.data as { ldapGroupCN: string })?.ldapGroupCN || ""}
              &quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Members of this LDAP group will no longer be added to the mapped Infisical group.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                const data = popUp?.deleteLdapGroupMap?.data as {
                  ldapGroupMapId: string;
                  ldapGroupCN: string;
                };
                return onDeleteGroupMapSubmit({
                  ldapConfigId: ldapConfig?.id ?? "",
                  ldapGroupMapId: data.ldapGroupMapId,
                  ldapGroupCN: data.ldapGroupCN
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
