import { useSearch } from "@tanstack/react-router";

// The ?requesterEmail= deep link from a project access-request notification.
export const useRequesterEmail = () =>
  useSearch({
    strict: false,
    select: (el) => (el as { requesterEmail?: string })?.requesterEmail
  });
