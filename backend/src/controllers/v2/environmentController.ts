import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { Secret, ServiceToken, Workspace, Integration } from '../../models';

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
  const { workspaceId, environmentName, environmentSlug } = req.body;
  try {
    // atomic create the environment
    const workspace = await Workspace.findOneAndUpdate(
      {
        _id: workspaceId,
        'environments.slug': { $ne: environmentSlug },
        'environments.name': { $ne: environmentName },
      },
      {
        $addToSet: {
          environments: { name: environmentName, slug: environmentSlug },
        },
      }
    );

    if (!workspace) {
      throw new Error('Failed to update workspace environment');
    }
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
  const { workspaceId, environmentName, environmentSlug, oldEnvironmentSlug } =
    req.body;
  try {
    // user should pass both new slug and env name
    if (!environmentSlug || !environmentName) {
      throw new Error('Invalid environment given.');
    }

    // atomic update the env to avoid conflict
    const workspace = await Workspace.findOneAndUpdate(
      { _id: workspaceId, 'environments.slug': oldEnvironmentSlug },
      {
        'environments.$.name': environmentName,
        'environments.$.slug': environmentSlug,
      }
    );
    if (!workspace) {
      throw new Error('Failed to update workspace');
    }

    await Secret.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
    await ServiceToken.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
    await Integration.updateMany(
      { workspace: workspaceId, environment: oldEnvironmentSlug },
      { environment: environmentSlug }
    );
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
  const { workspaceId, environmentSlug } = req.body;
  try {
    // atomic delete the env in the workspacce
    const workspace = await Workspace.findOneAndUpdate(
      { _id: workspaceId },
      {
        $pull: {
          environments: {
            slug: environmentSlug,
          },
        },
      }
    );
    if (!workspace) {
      throw new Error('Failed to delete workspace environment');
    }

    // clean up
    await Secret.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });
    await ServiceToken.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });
    await Integration.deleteMany({
      workspace: workspaceId,
      environment: environmentSlug,
    });

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
