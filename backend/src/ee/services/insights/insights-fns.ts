import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessVolumeActor, TAccessVolumeDay } from "./insights-types";

const ACCESS_VOLUME_DAYS = 7;
const STATIC_SECRET_USAGE_WEEKS = 12;

export const toUtcDateString = (date: Date) => date.toISOString().slice(0, 10);

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfUtcWeek = (date: Date) => {
  const monday = startOfUtcDay(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));

  return monday;
};

const listBucketStarts = (lastBucketStart: Date, count: number, stepDays: number) => {
  const bucketStarts: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const bucketStart = new Date(lastBucketStart);
    bucketStart.setUTCDate(bucketStart.getUTCDate() - i * stepDays);
    bucketStarts.push(toUtcDateString(bucketStart));
  }

  return bucketStarts;
};

export const buildAccessVolumeWindow = () => {
  const startOfToday = startOfUtcDay(new Date());

  const startDate = new Date(startOfToday);
  startDate.setUTCDate(startDate.getUTCDate() - (ACCESS_VOLUME_DAYS - 1));

  const endDate = new Date(startOfToday);
  endDate.setUTCHours(23, 59, 59, 999);

  return { dates: listBucketStarts(startOfToday, ACCESS_VOLUME_DAYS, 1), startDate, endDate };
};

export const buildStaticSecretUsageWindow = () => {
  const currentWeekStart = startOfUtcWeek(new Date());

  const windowStart = new Date(currentWeekStart);
  windowStart.setUTCDate(windowStart.getUTCDate() - (STATIC_SECRET_USAGE_WEEKS - 1) * 7);

  return {
    windowStart,
    currentWeekStart,
    weekStarts: listBucketStarts(currentWeekStart, STATIC_SECRET_USAGE_WEEKS, 7)
  };
};

export const buildAccessVolumeDayBuckets = (dates: string[]) =>
  new Map(dates.map((date) => [date, new Map<string, TAccessVolumeActor>()]));

// Rows outside the window are dropped. The same actor can arrive as several rows when the
// underlying aggregate groups on fields we do not surface, so counts are summed per actor.
export const addAccessVolumeEntry = (
  dayMap: Map<string, Map<string, TAccessVolumeActor>>,
  { date, type, name, count }: TAccessVolumeActor & { date: string }
) => {
  const actorMap = dayMap.get(date);
  if (!actorMap) return;

  const actorKey = `${type}:${name}`;
  const existing = actorMap.get(actorKey);
  if (existing) {
    existing.count += count;
  } else {
    actorMap.set(actorKey, { name, type, count });
  }
};

export const collapseAccessVolumeDays = (dayMap: Map<string, Map<string, TAccessVolumeActor>>): TAccessVolumeDay[] =>
  Array.from(dayMap.entries()).map(([date, actorMap]) => {
    const actors = Array.from(actorMap.values()).sort((a, b) => b.count - a.count);
    const total = actors.reduce((sum, actor) => sum + actor.count, 0);
    return { date, total, actors };
  });

// Audit log metadata only carries the userId, so display names come from the users table.
export const resolveUserDisplayNames = async (userDAL: Pick<TUserDALFactory, "find">, userIds: string[]) => {
  const userNameMap = new Map<string, string>();
  if (!userIds.length) return userNameMap;

  const users = await userDAL.find({ $in: { id: userIds } });
  users.forEach((user) => {
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    if (displayName) userNameMap.set(user.id, displayName);
  });

  return userNameMap;
};
