import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import {
  Secret,
  ServiceToken,
  Workspace,
  Integration,
  ServiceTokenData,
  Membership,
} from '../../models';
import { SecretVersion } from '../../ee/models';
import { BadRequestError } from '../../utils/errors';
import _ from 'lodash';
import { ABILITY_READ } from '../../variables/organization';

/**
 * Create new workspace environment named [environmentName] under workspace with id
 * @param req
 * @param res
 * @returns
 */
export const createWorkspaceEnvironment = async (
  req: Request,
  res: Response
) => {
  const { workspaceId } = req.params;
  const { environmentName, environmentSlug } = req.body;
  try {
    const workspace = await Workspace.findById(workspaceId).exec();
    if (
      !workspace ||
      workspace?.environments.find(
        ({ name, slug }) => slug === environmentSlug || environmentName === name
      )
    ) {
      throw new Error('Failed to create workspace environment');
    }

    workspace?.environments.push({
      name: environmentName,
      slug: environmentSlug.toLowerCase(),
    });
    await workspace.save();
  } catch (err) {
    Sentry.setUser({ email: req.user.email });
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Failed to create new workspace environment',
    });
  }

  return res.status(200).send({
    message: 'Successfully created new environment',
    workspace: workspaceId,
    environment: {
      name: environmentName,
      slug: environmentSlug,
    },
  });
};

/**
 * Rename workspace environment with new name and slug of a workspace with [workspaceId]
 * Old slug [oldEnvironmentSlug] must be provided
 * @param req
 * @param res
 * @returns
 */
export const renameWorkspaceEnvironment = async (
  req: Request,
  res: Response
) => {
  const { workspaceId } = req.params;
  const { environmentName, environmentSlug, oldEnvironmentSlug } = req.body;
  try {
    // user should pass both new slug and env name
    if (!environmentSlug || !environmentName) {
      throw new Error('Invalid environment given.');
    }

    // atomic update the env to avoid conflict
    const workspace = await Workspace.findById(workspaceId).exec();
    if (!workspace) {
      throw new Error('Failed to create workspace environment');
    }

    const isEnvExist = workspace.environments.some(
      ({ name, slug }) =>
        slug !== oldEnvironmentSlug &&
        (name === environmentName || slug === environmentSlug)
    );
    if (isEnvExist) {
      throw new Error('Invalid environment given');
    }

    const envIndex = workspace?.environments.findIndex(
      ({ slug }) => slug === oldEnvironmentSlug
    );
    if (envIndex === -1) {
      throw new Error('Invalid environment given');
    }

    workspace.environments[envIndex].name = environmentName;
    workspace.environments[envIndex].slug = environmentSlug.toLowerCase();

    await workspace.save();
    await Secret.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
    await SecretVersion.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
    await ServiceToken.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
    await ServiceTokenData.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
    await Integration.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
    await Membership.updateMany(
      {
        workspace: workspaceId,
        "deniedPermissions.environmentSlug": oldEnvironmentSlug
      },
      { $set: { "deniedPermissions.$[element].environmentSlug": environmentSlug } },
      { arrayFilters: [{ "element.environmentSlug": oldEnvironmentSlug }] }
    )

  } catch (err) {
    Sentry.setUser({ email: req.user.email });
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Failed to update workspace environment',
    });
  }

  return res.status(200).send({
    message: 'Successfully update environment',
    workspace: workspaceId,
    environment: {
      name: environmentName,
      slug: environmentSlug,
    },
  });
};

/**
 * Delete workspace environment by [environmentSlug] of workspace [workspaceId] and do the clean up
 * @param req
 * @param res
 * @returns
 */
export const deleteWorkspaceEnvironment = async (
  req: Request,
  res: Response
) => {
  const { workspaceId } = req.params;
  const { environmentSlug } = req.body;
  try {
    // atomic update the env to avoid conflict
    const workspace = await Workspace.findById(workspaceId).exec();
    if (!workspace) {
      throw new Error('Failed to create workspace environment');
    }

    const envIndex = workspace?.environments.findIndex(
      ({ slug }) => slug === environmentSlug
    );
    if (envIndex === -1) {
      throw new Error('Invalid environment given');
    }

    workspace.environments.splice(envIndex, 1);
    await workspace.save();

    // clean up
    await Secret.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });
    await SecretVersion.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });
    await ServiceToken.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });
    await ServiceTokenData.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });
    await Integration.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });
    await Membership.updateMany(
      { workspace: workspaceId },
      { $pull: { deniedPermissions: { environmentSlug: environmentSlug } } }
    )

  } catch (err) {
    Sentry.setUser({ email: req.user.email });
    Sentry.captureException(err);
    return res.status(400).send({
      message: 'Failed to delete workspace environment',
    });
  }

  return res.status(200).send({
    message: 'Successfully deleted environment',
    workspace: workspaceId,
    environment: environmentSlug,
  });
};


export const getAllAccessibleEnvironmentsOfWorkspace = async (
  req: Request,
  res: Response
) => {
  const { workspaceId } = req.params;
  const workspacesUserIsMemberOf = await Membership.findOne({
    workspace: workspaceId,
    user: req.user
  })

  if (!workspacesUserIsMemberOf) {
    throw BadRequestError()
  }

  const accessibleEnvironments: { name: string; slug: string; }[] = []
  const deniedPermission = workspacesUserIsMemberOf.deniedPermissions

  const relatedWorkspace = await Workspace.findById(workspaceId)
  if (!relatedWorkspace) {
    throw BadRequestError()
  }
  relatedWorkspace.environments.forEach(environment => {
    const isReadBlocked = _.some(deniedPermission, { environmentSlug: environment.slug, ability: ABILITY_READ })
    // const isWriteBlocked = _.some(deniedPermission, { environmentSlug: environment.slug, ability: ABILITY_WRITE })
    if (isReadBlocked) {
      return
    } else {
      accessibleEnvironments.push(environment)
    }
  })

  res.json({ accessibleEnvironments })
};
