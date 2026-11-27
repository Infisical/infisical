import { useV4Session } from "../../data/session/contract";

export const displayName = (user: { firstName?: string | null; lastName?: string | null }) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;

export const useIsSelf = () => {
  const { user } = useV4Session();
  return (person: { username?: string | null; email?: string | null }) =>
    Boolean(user.email) && (person.email === user.email || person.username === user.email);
};
