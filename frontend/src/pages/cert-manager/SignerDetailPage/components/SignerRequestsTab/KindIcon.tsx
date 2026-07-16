import { HardDriveIcon, UserIcon, UsersIcon } from "lucide-react";

export const KindIcon = ({ kind }: { kind: "user" | "identity" | "group" }) => {
  // eslint-disable-next-line no-nested-ternary
  const Icon = kind === "user" ? UserIcon : kind === "identity" ? HardDriveIcon : UsersIcon;
  return <Icon className="h-3.5 w-3.5 text-mineshaft-300" />;
};
