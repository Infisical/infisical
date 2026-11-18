import { randomUUID } from "node:crypto";

import { buildAccessControl } from "../../testing/build-access-control";

describe("GroupService.findGroupsByIds", () => {
  test("should return the groups with these ids and leave out unknown ones", async () => {
    // Setup
    const { groupService, seed } = buildAccessControl();
    const orgId = randomUUID();
    const group = await seed.group({ orgId });
    await seed.group({ orgId });

    // Action
    const groups = await groupService.findGroupsByIds({ ids: [group.id, randomUUID()] });

    // Assert
    expect(groups).toEqual([{ id: group.id, orgId, name: group.name, slug: group.slug }]);
  });
});
