import { useCallback, useEffect, useState } from "react";
import { ArrowUpDownIcon } from "lucide-react";

import { DashboardSecretsOrderBy } from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { getSecretSortValue, SECRET_SORT_OPTIONS } from "./OverviewPage.utils";

type Params = {
  visibleEnvs: { slug: string; name: string }[];
  orderBy: DashboardSecretsOrderBy;
  orderDirection: OrderByDirection;
  setOrderBy: (orderBy: DashboardSecretsOrderBy) => void;
  setOrderDirection: (orderDirection: OrderByDirection) => void;
  setPage: (page: number) => void;
};

export const useSecretSort = ({
  visibleEnvs,
  orderBy,
  orderDirection,
  setOrderBy,
  setOrderDirection,
  setPage
}: Params) => {
  const [sortEnvironment, setSortEnvironment] = useState<string>();

  const shouldClearSortEnvironment = Boolean(
    sortEnvironment &&
    (visibleEnvs.length === 1 ||
      !visibleEnvs.some((environment) => environment.slug === sortEnvironment))
  );
  const timestampSortField =
    orderBy === DashboardSecretsOrderBy.CreatedAt || orderBy === DashboardSecretsOrderBy.UpdatedAt
      ? orderBy
      : undefined;
  const isTimestampSort = timestampSortField !== undefined;
  const shouldResetTimestampSort =
    isTimestampSort && visibleEnvs.length > 1 && (!sortEnvironment || shouldClearSortEnvironment);

  useEffect(() => {
    if (shouldClearSortEnvironment) {
      setSortEnvironment(undefined);
    }

    if (shouldResetTimestampSort) {
      setOrderBy(DashboardSecretsOrderBy.Name);
      setOrderDirection(OrderByDirection.ASC);
    }

    if (shouldClearSortEnvironment || shouldResetTimestampSort) {
      setPage(1);
    }
  }, [
    shouldClearSortEnvironment,
    shouldResetTimestampSort,
    setOrderBy,
    setOrderDirection,
    setPage
  ]);

  const handleSecretSortChange = useCallback(
    (value: string, environment?: string) => {
      const option = SECRET_SORT_OPTIONS.find(
        ({ orderBy: nextOrderBy, orderDirection: nextOrderDirection }) =>
          getSecretSortValue(nextOrderBy, nextOrderDirection) === value
      );

      if (!option) return;

      setOrderBy(option.orderBy);
      setOrderDirection(option.orderDirection);
      setSortEnvironment(environment);
      setPage(1);
    },
    [setOrderBy, setOrderDirection, setPage]
  );

  const activeSecretSort = SECRET_SORT_OPTIONS.find(
    (option) =>
      getSecretSortValue(option.orderBy, option.orderDirection) ===
      getSecretSortValue(orderBy, orderDirection)
  );
  const ActiveSecretSortIcon = activeSecretSort?.Icon ?? ArrowUpDownIcon;
  const isNameHeaderSortActive =
    !sortEnvironment &&
    !(orderBy === DashboardSecretsOrderBy.Name && orderDirection === OrderByDirection.ASC);
  let activeSecretSortScope = "";
  if (sortEnvironment) {
    activeSecretSortScope = ` in ${
      visibleEnvs.find((environment) => environment.slug === sortEnvironment)?.name ??
      sortEnvironment
    }`;
  }

  return {
    sortEnvironment,
    shouldClearSortEnvironment,
    isTimestampSort,
    timestampSortField,
    shouldResetTimestampSort,
    handleSecretSortChange,
    activeSecretSort,
    ActiveSecretSortIcon,
    isNameHeaderSortActive,
    activeSecretSortScope
  };
};
