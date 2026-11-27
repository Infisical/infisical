import { useCallback, useState } from "react";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";

const SMALLEST_PAGE_SIZE = 10;

export const usePageSize = (table: string, defaultSize: number) => {
  const [pageSize, setPageSize] = useState(() =>
    getUserTablePreference(table, PreferenceKey.PerPage, defaultSize)
  );
  const savePageSize = useCallback(
    (next: number) => {
      setPageSize(next);
      setUserTablePreference(table, PreferenceKey.PerPage, next);
    },
    [table]
  );
  const showPagination = (total: number) => total > Math.min(pageSize, SMALLEST_PAGE_SIZE);
  return [pageSize, savePageSize, showPagination] as const;
};
