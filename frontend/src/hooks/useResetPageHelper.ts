import { Dispatch, SetStateAction, useEffect } from "react";

export const useResetPageHelper = ({
  totalCount,
  offset,
  setPage
}: {
  totalCount: number;
  offset: number;
  setPage: Dispatch<SetStateAction<number>>;
}) => {
  useEffect(() => {
    // reset page if no longer valid
    if (totalCount <= offset) setPage(1);
  }, [totalCount]);
};
