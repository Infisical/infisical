import { request } from "./request";

export type TUserNotification = { type: string; title: string; body: string | null; link: string | null };

// Lists the in-app notifications of the user `authToken` belongs to, in the org it is scoped to.
export const listUserNotifications = (authToken: string) =>
  request(
    {
      method: "GET",
      url: "/api/v1/notifications/user",
      headers: { authorization: `Bearer ${authToken}` }
    },
    (res) => {
      expect(res.statusCode, res.payload).toBe(200);
      return res.json<{ notifications: TUserNotification[] }>().notifications;
    }
  );
