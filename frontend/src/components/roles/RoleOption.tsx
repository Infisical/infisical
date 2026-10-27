export const RoleOptionContent = ({
  role
}: {
  role: { name: string; description?: string | undefined };
}) => (
  <div className="min-w-0">
    <p className="truncate">{role.name}</p>
    {role.description ? (
      <p className="text-xs leading-4 break-words whitespace-normal text-muted">
        {role.description}
      </p>
    ) : (
      <p className="text-xs leading-4 text-muted/50">No Description</p>
    )}
  </div>
);
