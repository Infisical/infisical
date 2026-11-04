import { Dispatch, SetStateAction, useEffect, useRef } from "react";

// Resetting the page from the search input's onChange instead would move the
// query to an unfiltered page one a full debounce interval before the search
// term lands, flashing a cached page of unfiltered rows in between.
export const useResetPageOnSearch = ({
  debouncedSearch,
  setPage
}: {
  debouncedSearch: string;
  setPage: Dispatch<SetStateAction<number>>;
}) => {
  const lastSearch = useRef(debouncedSearch);

  useEffect(() => {
    if (lastSearch.current === debouncedSearch) return;
    lastSearch.current = debouncedSearch;
    setPage(1);
  }, [debouncedSearch]);
};
