import { z } from "zod";

export const isUuidV4 = (uuid: string) => z.string().uuid().safeParse(uuid).success;
