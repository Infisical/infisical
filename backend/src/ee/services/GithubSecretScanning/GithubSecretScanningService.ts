import { Probot } from "probot";
import {
  GitAppOrganizationInstallation,
  GitRisks 
} from "../../models";
import { scanGithubPushEventForSecretLeaks } from "../../../queues/secret-scanning/githubScanPushEvent";
export default async (app: Probot) => {
  app.on("installation.deleted", async (context) => {
    const { payload } = context;
    const { installation, repositories } = payload;
    if (repositories) {
      for (const repository of repositories) {
        await GitRisks.deleteMany({ repositoryId: repository.id })
      }
      await GitAppOrganizationInstallation.deleteOne({ installationId: installation.id })
    }
  })

  app.on("installation", async (context) => {
    const { payload } = context;
    payload.repositories
    const { installation, repositories } = payload;
    // TODO: start full repo scans 
  })

  app.on("push", async (context) => {
    const { payload } = context;
    const { commits, repository, installation, pusher } = payload;

    if (!commits || !repository || !installation || !pusher) {
      return
    }

    const installationLinkToOrgExists = await GitAppOrganizationInstallation.findOne({ installationId: installation?.id }).lean()
    if (!installationLinkToOrgExists) {
      return
    }

    scanGithubPushEventForSecretLeaks({
      commits: commits,
      pusher: { name: pusher.name, email: pusher.email },
      repository: { fullName: repository.full_name, id: repository.id },
      organizationId: installationLinkToOrgExists.organizationId,
      installationId: installation.id
    })
  });
};
