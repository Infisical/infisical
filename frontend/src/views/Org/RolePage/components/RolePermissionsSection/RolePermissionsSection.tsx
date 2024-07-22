import { RolePermissionsTable } from "./RolePermissionsTable";

type Props = {
  roleId: string;
};

export const RolePermissionsSection = ({ roleId }: Props) => {
  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Permissions</h3>
      </div>
      <div className="py-4">
        <RolePermissionsTable roleId={roleId} />
      </div>
    </div>
  );
};
