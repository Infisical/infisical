import { Knex } from "knex";

import { BadRequestError, ForbiddenRequestError, NotFoundError, ScimRequestError } from "@app/lib/errors";

import {
  TAddIdentitiesToGroup,
  TAddIdentitiesToGroupByIdentityIds,
  TRemoveIdentitiesFromGroupByIdentityIds
} from "./identity-group-types";

const addIdentitiesDirectlyToGroup = async ({
  identityIds,
  group,
  identityGroupMembershipDAL,
  identityDAL,
  identityGroupProjectDAL,
  projectDAL,
  tx
}: TAddIdentitiesToGroup) => {
  const identities = await identityDAL.find(
    {
      $in: {
        id: identityIds
      }
    },
    { tx }
  );

  await identityGroupMembershipDAL.insertMany(
    identities.map((identity) => ({
      identityId: identity.id,
      groupId: group.id
    })),
    tx
  );

  // check which projects the group is part of
  const projectIds = Array.from(
    new Set(
      (
        await identityGroupProjectDAL.find(
          {
            groupId: group.id
          },
          { tx }
        )
      ).map((igp) => igp.projectId)
    )
  );

  for await (const projectId of projectIds) {
    const project = await projectDAL.findById(projectId, tx);
    if (!project) {
      throw new NotFoundError({
        message: `Failed to find project with ID '${projectId}'`
      });
    }
  }
};

/**
 * Add identities with identity ids [identityIds] to group [group].
 * @param {group} group - group to add identity/identities to
 * @param {string[]} identityIds - id(s) of identity/identities to add to group
 */
export const addIdentitiesToGroupByIdentityIds = async ({
  group,
  identityIds,
  identityDAL,
  identityGroupMembershipDAL,
  identityOrgMembershipDAL,
  identityGroupProjectDAL,
  projectDAL,
  tx: outerTx
}: TAddIdentitiesToGroupByIdentityIds) => {
  const processAddition = async (tx: Knex) => {
    const foundIdentities = await identityDAL.find(
      {
        $in: {
          id: identityIds
        }
      },
      { tx }
    );

    const foundIdentitiesIdsSet = new Set(foundIdentities.map((identity) => identity.id));

    const isCompleteMatch = identityIds.every((identityId) => foundIdentitiesIdsSet.has(identityId));

    if (!isCompleteMatch) {
      throw new ScimRequestError({
        detail: "Identities not found",
        status: 404
      });
    }

    // check if identity/identities group membership(s) already exists
    const existingIdentityGroupMemberships = await identityGroupMembershipDAL.find(
      {
        groupId: group.id,
        $in: {
          identityId: identityIds
        }
      },
      { tx }
    );

    if (existingIdentityGroupMemberships.length) {
      throw new BadRequestError({
        message: `Identity/Identities are already part of the group ${group.slug}`
      });
    }

    await Promise.all(
      identityIds.map(async (identityId) => {
        const existingIdentityOrgMembership = await identityOrgMembershipDAL.find({
          identityId,
          orgId: group.orgId
        });
        if (!existingIdentityOrgMembership) {
          throw new ForbiddenRequestError({
            message: `Identity with id ${identityId} is not part of the organization`
          });
        }
      })
    );

    // All identities are added directly (no pending state like users)
    await addIdentitiesDirectlyToGroup({
      identityIds: foundIdentities.map((identity) => identity.id),
      group,
      identityDAL,
      identityGroupMembershipDAL,
      identityGroupProjectDAL,
      projectDAL,
      tx
    });

    return foundIdentities;
  };

  if (outerTx) {
    return processAddition(outerTx);
  }
  return identityDAL.transaction(async (tx) => {
    return processAddition(tx);
  });
};

/**
 * Remove identities with identity ids [identityIds] from group [group].
 * @param {group} group - group to remove identity/identities from
 * @param {string[]} identityIds - id(s) of identity/identities to remove from group
 */
export const removeIdentitiesFromGroupByIdentityIds = async ({
  group,
  identityIds,
  identityDAL,
  identityGroupMembershipDAL,
  tx: outerTx
}: TRemoveIdentitiesFromGroupByIdentityIds) => {
  const processRemoval = async (tx: Knex) => {
    const foundIdentities = await identityDAL.find({
      $in: {
        id: identityIds
      }
    });

    const foundIdentitiesIdsSet = new Set(foundIdentities.map((identity) => identity.id));

    const isCompleteMatch = identityIds.every((identityId) => foundIdentitiesIdsSet.has(identityId));

    if (!isCompleteMatch) {
      throw new ScimRequestError({
        detail: "Identities not found",
        status: 404
      });
    }

    // check if identity group membership already exists
    const existingIdentityGroupMemberships = await identityGroupMembershipDAL.find(
      {
        groupId: group.id,
        $in: {
          identityId: identityIds
        }
      },
      { tx }
    );

    const existingIdentityGroupMembershipsIdentityIdsSet = new Set(
      existingIdentityGroupMemberships.map((i) => i.identityId)
    );

    identityIds.forEach((identityId) => {
      if (!existingIdentityGroupMembershipsIdentityIdsSet.has(identityId))
        throw new ForbiddenRequestError({
          message: `Identity/Identities are not part of the group ${group.slug}`
        });
    });

    const promises: Array<Promise<void>> = [];
    for (const identityId of identityIds) {
      promises.push(
        (async () => {
          await identityGroupMembershipDAL.delete(
            {
              groupId: group.id,
              identityId
            },
            tx
          );
        })()
      );
    }
    await Promise.all(promises);

    return foundIdentities;
  };

  if (outerTx) {
    return processRemoval(outerTx);
  }
  return identityDAL.transaction(async (tx) => {
    return processRemoval(tx);
  });
};
