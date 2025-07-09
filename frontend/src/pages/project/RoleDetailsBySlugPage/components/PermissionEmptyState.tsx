import { useFormContext } from "react-hook-form";

import { EmptyState } from "@app/components/v2";

import { TFormSchema } from "./ProjectRoleModifySection.utils";

// This is made into seperate component because watch subscribes to all permissions
// thus keeping in top level casues render on all ones
export const PermissionEmptyState = () => {
  const { watch } = useFormContext<TFormSchema>();
  const isNotEmptyPermissions = Object.entries(watch("permissions") || {}).some(
    ([key, value]) => key && value?.length > 0
  );

  if (isNotEmptyPermissions) return null;

  return <EmptyState title="No policies applied" className="py-8" />;
};
