import { useRouterState } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

// Every product's layout and org-level pages publish productType into route context, so this is the one
// place that knows which product's accent the page wears. The root mirrors it onto <html data-product>,
// which repoints --color-project for everything rendered, portals included.
export const useActiveProduct = (): ProjectType | null =>
  useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i -= 1) {
        const { productType } = state.matches[i].context;
        if (productType) return productType;
      }
      return null;
    }
  });
