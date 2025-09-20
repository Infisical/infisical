import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { projectKeys } from "@app/hooks/api";
import { fetchProjectById } from "@app/hooks/api/projects/queries";

export const useNamespace = () => {
  const params = useParams({
    strict: false
  });
  if (!params.namespaceName) {
    throw new Error("Missing namespace name");
  }

  return { namespaceName: params.namespaceName };
};
