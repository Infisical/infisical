import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";

import { namespacesQueryKeys } from "@app/hooks/api/namespaces";

export const useNamespace = () => {
  const params = useParams({
    strict: false
  });

  if (!params.namespaceId) {
    throw new Error("Missing namespace id");
  }

  const { data: namespace } = useSuspenseQuery({
    ...namespacesQueryKeys.detail({
      namespaceId: params.namespaceId
    }),
    staleTime: Infinity
  });

  return { namespaceId: params.namespaceId, namespace };
};
