import { useFormContext } from "react-hook-form";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@app/components/v3";

import { TFormSchema } from "./ProjectRoleModifySection.utils";

// This is made into seperate component because watch subscribes to all permissions
// thus keeping in top level casues render on all ones
export const PermissionEmptyState = () => {
  const { watch } = useFormContext<TFormSchema>();
  const isNotEmptyPermissions = Object.entries(watch("permissions") || {}).some(
    ([key, value]) => key && value?.length > 0
  );

  if (isNotEmptyPermissions) return null;

  return (
    <Empty className="border py-8">
      <EmptyHeader>
        <EmptyTitle>No policies applied</EmptyTitle>
        <EmptyDescription>Add policies to configure permissions for this role.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
};
