import { describe, expect, it } from "vitest";

import { mongodbCredentialsRotationFactory } from "./mongodb-credentials-rotation-fns";
import { TMongoDBCredentialsRotationWithConnection } from "./mongodb-credentials-rotation-types";

const makeFactory = (username1: string, username2: string) =>
  mongodbCredentialsRotationFactory(
    {
      connection: { credentials: { username: "manager" } },
      parameters: { username1, username2 }
    } as unknown as TMongoDBCredentialsRotationWithConnection,
    ...([{}, {}, {}, {}, {}] as unknown as [
      Parameters<typeof mongodbCredentialsRotationFactory>[1],
      Parameters<typeof mongodbCredentialsRotationFactory>[2],
      Parameters<typeof mongodbCredentialsRotationFactory>[3],
      Parameters<typeof mongodbCredentialsRotationFactory>[4],
      Parameters<typeof mongodbCredentialsRotationFactory>[5]
    ])
  );

describe("MongoDB credentials rotation", () => {
  it.each([
    ["manager", "user_2"],
    ["user_1", "manager"]
  ])("refuses to rotate the connection user (%s, %s)", (username1, username2) => {
    expect(() => makeFactory(username1, username2)).toThrow(
      "Rotation username cannot be the same as the connection username. The connection credentials are used to execute rotation operations and changing their password would break the connection."
    );
  });

  it("accepts two users other than the connection user", () => {
    expect(() => makeFactory("user_1", "user_2")).not.toThrow();
  });
});
