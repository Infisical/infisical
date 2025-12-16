export type ViewAuthMethodProps = {
  identityId: string;
  onDelete: () => void;
  onEdit: () => void;
  lockedOut: boolean;
  onResetAllLockouts: () => void;
};
