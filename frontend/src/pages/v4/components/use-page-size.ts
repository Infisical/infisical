import { useCallback, useState } from "react";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";

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
  return [pageSize, savePageSize] as const;
};
