import { useParams } from "@tanstack/react-router";

export const useNamespace = () => {
  const params = useParams({
    strict: false
  });
  if (!params.namespaceName) {
    throw new Error("Missing namespace name");
  }

  return { namespaceName: params.namespaceName };
};
