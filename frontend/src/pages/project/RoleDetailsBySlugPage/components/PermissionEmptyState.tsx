import { useFormContext } from "react-hook-form";

import {
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";

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
    <UnstableEmpty className="border py-8">
      <UnstableEmptyHeader>
        <UnstableEmptyTitle>No policies applied</UnstableEmptyTitle>
        <UnstableEmptyDescription>
          Add policies to configure permissions for this role.
        </UnstableEmptyDescription>
      </UnstableEmptyHeader>
    </UnstableEmpty>
  );
};
