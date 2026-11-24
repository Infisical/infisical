import { Knex } from "knex";

export type TActivityPeriodWindow = {
  startDate: Date;
  endDate: Date;
  useDaily: boolean;
};

export const getActivityPeriodWindow = (daysBack: number): TActivityPeriodWindow => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);
  startDate.setHours(0, 0, 0, 0);

  const useDaily = daysBack <= 30;
  if (!useDaily) {
    startDate.setDate(1);
  }

  return { startDate, endDate: new Date(), useDaily };
};

export const selectActivityPeriod = (db: Knex, { useDaily }: TActivityPeriodWindow, table: string, column: string) =>
  db.raw(`to_char(date_trunc(?, "${table}"."${column}"), ?) as period`, [
    useDaily ? "day" : "month",
    useDaily ? "YYYY-MM-DD" : "YYYY-MM"
  ]);

export const fillActivityPeriods = <T extends object>(
  { startDate, endDate, useDaily }: TActivityPeriodWindow,
  getCounts: (period: string) => T
) => {
  const periods: Array<{ period: string } & T> = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const period = useDaily ? `${month}-${String(cursor.getDate()).padStart(2, "0")}` : month;
    periods.push({ period, ...getCounts(period) });
    if (useDaily) {
      cursor.setDate(cursor.getDate() + 1);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return periods;
};
