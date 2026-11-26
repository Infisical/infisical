import type { ComponentProps } from "react";
import { Select, type SelectOption } from "@infisical/cipher/ui/select";

import { roleOptions } from "../access/roles";

type RoleSelectProps = Omit<ComponentProps<typeof Select>, "options" | "descriptionLayout"> &
  (
    | { roles: Parameters<typeof roleOptions>[0]; options?: never }
    | { options: readonly SelectOption[]; roles?: never }
  );

export const RoleSelect = ({ roles, options, ...props }: RoleSelectProps) => (
  <Select {...props} descriptionLayout="stacked" options={roles ? roleOptions(roles) : options} />
);
