import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useCreateGroup, useGetOrgRoles, useUpdateGroup } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const GroupFormSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(50, "Name must be 50 characters or fewer"),
  slug: z
    .string()
    .min(5, "Slug must be at least 5 characters long")
    .max(36, "Slug must be 36 characters or fewer"),
  role: z.string()
});

export type TGroupFormData = z.infer<typeof GroupFormSchema>;

type Props = {
  popUp: UsePopUpState<["group"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["group"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["group"]>, state?: boolean) => void;
};

export const OrgGroupModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: roles } = useGetOrgRoles(currentOrg?.id || "");
  const { mutateAsync: createMutateAsync, isLoading: createIsLoading } = useCreateGroup();
  const { mutateAsync: updateMutateAsync, isLoading: updateIsLoading } = useUpdateGroup();

  const { control, handleSubmit, reset } = useForm<TGroupFormData>({
    resolver: zodResolver(GroupFormSchema)
  });

  useEffect(() => {
    const group = popUp?.group?.data as {
      groupId: string;
      name: string;
      slug: string;
      role: string;
      customRole: {
        name: string;
        slug: string;
      };
    };

    if (!roles?.length) return;

    if (group) {
      reset({
        name: group.name,
        slug: group.slug,
        role: group?.customRole?.slug ?? group.role
      });
    } else {
      reset({
        name: "",
        slug: "",
        role: roles[0].slug
      });
    }
  }, [popUp?.group?.data, roles]);

  const onGroupModalSubmit = async ({ name, slug, role }: TGroupFormData) => {
    try {
      if (!currentOrg?.id) return;

      const group = popUp?.group?.data as {
        groupId: string;
        name: string;
        slug: string;
      };

      if (group) {
        await updateMutateAsync({
          id: group.groupId,
          name,
          slug,
          role: role || undefined
        });
      } else {
        await createMutateAsync({
          name,
          slug,
          organizationId: currentOrg.id,
          role: role || undefined
        });
      }
      handlePopUpToggle("group", false);
      reset();

      createNotification({
        text: `Successfully ${popUp?.group?.data ? "updated" : "created"} group`,
        type: "success"
      });
    } catch (err) {
      createNotification({
        text: `Failed to ${popUp?.group?.data ? "updated" : "created"} group`,
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.group?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("group", isOpen);
        reset();
      }}
    >
      <ModalContent title={`${popUp?.group?.data ? "Update" : "Create"} Group`}>
        <form onSubmit={handleSubmit(onGroupModalSubmit)}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Name" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="Engineering" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Slug" errorText={error?.message} isError={Boolean(error)}>
                <Input {...field} placeholder="engineering" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="role"
            defaultValue=""
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label={`${popUp?.group?.data ? "Update" : ""} Role`}
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
                    <SelectItem value={slug} key={`org-group-role-${slug}`}>
                      {name}
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
              isLoading={createIsLoading || updateIsLoading}
            >
              {!popUp?.group?.data ? "Create" : "Update"}
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpClose("group")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
