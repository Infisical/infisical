import type { User } from "@app/hooks/api/users/types";

export const displayName = (user: Pick<User, "firstName" | "lastName">) =>
  `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null;

export const usernameOf = (user: Pick<User, "username" | "email">) =>
  user.username || user.email || "";
