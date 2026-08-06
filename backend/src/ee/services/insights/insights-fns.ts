import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessVolumeActor, TAccessVolumeDay } from "./insights-types";

const ACCESS_VOLUME_DAYS = 7;

export const buildAccessVolumeWindow = () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const endDate = new Date(`${todayStr}T23:59:59.999Z`);
  const startDate = new Date(`${todayStr}T00:00:00.000Z`);
  startDate.setUTCDate(startDate.getUTCDate() - (ACCESS_VOLUME_DAYS - 1));

  return { todayStr, startDate, endDate };
};

// Every date in the window, oldest first, so days with no access still appear in the response
// rather than being skipped.
export const listAccessVolumeDates = (todayStr: string) => {
  const dates: string[] = [];
  for (let i = ACCESS_VOLUME_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(`${todayStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  return dates;
};

export const buildAccessVolumeDayBuckets = (todayStr: string) =>
  new Map(listAccessVolumeDates(todayStr).map((date) => [date, new Map<string, TAccessVolumeActor>()]));

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
