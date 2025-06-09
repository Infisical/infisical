import { useState } from "react";

import { OrderByDirection } from "@app/hooks/api/generic/types";
import { useDebounce } from "@app/hooks/useDebounce";

export const usePagination = <T extends string>(
  initialOrderBy: T,
  {
    initPerPage = 100,
    initSearch = ""
  }: {
    initPerPage?: number;
    initSearch?: string;
  } = {}
) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(initPerPage);
  const [orderDirection, setOrderDirection] = useState(OrderByDirection.ASC);
  const [orderBy, setOrderBy] = useState<T>(initialOrderBy);
  const [search, setSearch] = useState(initSearch);
  const [debouncedSearch] = useDebounce(search);

  const offset = (page - 1) * perPage;

  return {
    offset,
    limit: perPage,
    page,
    setPage,
    perPage,
    setPerPage,
    orderDirection,
    setOrderDirection,
    debouncedSearch,
    search,
    setSearch,
    orderBy,
    setOrderBy,
    toggleOrderDirection: () =>
      setOrderDirection((prev) =>
        prev === OrderByDirection.DESC ? OrderByDirection.ASC : OrderByDirection.DESC
      )
  };
};
