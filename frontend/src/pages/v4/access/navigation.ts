import { useNavigate } from "@tanstack/react-router";

export const useGo = () => {
  const navigate = useNavigate();
  return (href: string) => navigate({ href });
};
