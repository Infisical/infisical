import { ForbiddenError } from "@casl/ability";

import { TAgentVaultSkillVersions } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { getAgentVaultPermission, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultSkillBundleDALFactory } from "./agent-vault-skill-bundle-dal";
import { TAgentVaultSkillDALFactory, TAgentVaultSkillSummaryRow } from "./agent-vault-skill-dal";
import {
  AGENT_VAULT_MAX_SKILLS,
  AGENT_VAULT_MAX_SKILLS_PER_BUNDLE,
  AGENT_VAULT_SKILL_MANIFEST,
  AGENT_VAULT_SKILL_VERSIONS_KEPT,
  deserializeSkillFiles,
  parseSkillHeader,
  replaceSkillHeaderName,
  validateSkillFiles
} from "./agent-vault-skill-fns";
import {
  TAgentVaultBundleSkill,
  TAgentVaultSkill,
  TAgentVaultSkillScoped,
  TAgentVaultSkillVersion,
  TAgentVaultSkillWithBundles,
  TBundleSkillDTO,
  TBundleSkillsDTO,
  TCreateSkillDTO,
  TListSkillsDTO,
  TSkillByIdDTO,
  TSkillVersionDTO,
  TUpdateSkillDTO
} from "./agent-vault-skill-types";
import { TAgentVaultSkillVersionDALFactory, TAgentVaultSkillVersionRow } from "./agent-vault-skill-version-dal";

type TAgentVaultSkillServiceFactoryDep = {
  agentVaultSkillDAL: TAgentVaultSkillDALFactory;
  agentVaultSkillVersionDAL: TAgentVaultSkillVersionDALFactory;
  agentVaultSkillBundleDAL: TAgentVaultSkillBundleDALFactory;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "findByIdInProject" | "lockByIdInProject">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAgentVaultSkillServiceFactory = ReturnType<typeof agentVaultSkillServiceFactory>;

export const agentVaultSkillServiceFactory = ({
  agentVaultSkillDAL,
  agentVaultSkillVersionDAL,
  agentVaultSkillBundleDAL,
  agentVaultAccessBundleDAL,
  permissionService,
  membershipDAL,
  kmsService
}: TAgentVaultSkillServiceFactoryDep) => {
  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const $getPermission = async (scoped: TAgentVaultSkillScoped) =>
    (await getAgentVaultPermission({ permissionService }, scoped)).permission;

  const $authorize = async (scoped: TAgentVaultSkillScoped, action: ProjectPermissionAgentVaultSkillActions) => {
    const permission = await $getPermission(scoped);
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentVaultSkills);
  };

  // A member sees only the skills on bundles they can reach, so accessBundleIds is null for an admin and the
  // reachable bundles otherwise.
  const $authorizeRead = async (scoped: TAgentVaultSkillScoped) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      scoped
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSkillActions.Read,
      ProjectPermissionSub.AgentVaultSkills
    );
    return accessBundleIds;
  };

  // Adding a skill changes what a bundle hands out, so it is a bundle edit, and the skill has to be one the caller can see.
  const $authorizeBundleLink = async (scoped: TAgentVaultSkillScoped) => {
    const permission = await $getPermission(scoped);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultSkillActions.Read,
      ProjectPermissionSub.AgentVaultSkills
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
  };

  const projectSkill = (row: TAgentVaultSkillSummaryRow): TAgentVaultSkill => ({
    id: row.id,
    name: row.name,
    description: row.description,
    latestVersion: row.latestVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });

  const projectVersion = (row: TAgentVaultSkillVersionRow): TAgentVaultSkillVersion => ({
    id: row.id,
    version: row.version,
    sha256: row.sha256,
    sizeBytes: row.sizeBytes,
    fileCount: row.fileCount,
    createdAt: row.createdAt
  });

  const skillNotFound = (skillId: string) => new NotFoundError({ message: `Skill with ID '${skillId}' not found` });

  const bundleNotFound = (accessBundleId: string) =>
    new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

  const duplicateNameMessage = (name: string) => `A skill named '${name}' already exists.`;

  const $findSkill = async ({ skillId, projectId }: { skillId: string; projectId: string }) => {
    const skill = await agentVaultSkillDAL.findSummaryByIdInProject({ id: skillId, projectId });
    if (!skill) throw skillNotFound(skillId);
    return skill;
  };

  const createSkill = async ({ files, ...scoped }: TCreateSkillDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultSkillActions.Create);

    const validated = validateSkillFiles(files);
    const { encryptor } = await getProjectCipher(scoped.projectId);
    const encryptedFiles = encryptor({ plainText: validated.serialized }).cipherTextBlob;

    // Serialised per project so the count is authoritative. The unique index backs the name check.
    const write = () =>
      agentVaultSkillDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateAgentVaultSkill(scoped.projectId)]);

        const existing = await agentVaultSkillDAL.findByNameInProject(
          { name: validated.name, projectId: scoped.projectId },
          tx
        );
        if (existing) throw new ConflictError({ message: duplicateNameMessage(validated.name) });

        const skillCount = await agentVaultSkillDAL.countInProject(scoped.projectId, tx);
        if (skillCount >= AGENT_VAULT_MAX_SKILLS) {
          throw new BadRequestError({
            message: `This organization already has ${AGENT_VAULT_MAX_SKILLS} skills, the most allowed. Delete an unused one first.`
          });
        }

        const skill = await agentVaultSkillDAL.create(
          { projectId: scoped.projectId, name: validated.name, description: validated.description },
          tx
        );
        const version = await agentVaultSkillVersionDAL.create(
          {
            skillId: skill.id,
            version: 1,
            encryptedFiles,
            sha256: validated.sha256,
            sizeBytes: validated.sizeBytes,
            fileCount: validated.fileCount
          },
          tx
        );
        return { skill, version };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError({ message: duplicateNameMessage(validated.name) });
      throw err;
    }

    return {
      skill: projectSkill({ ...result.skill, latestVersion: result.version.version }),
      version: projectVersion(result.version)
    };
  };

  // The skill row lock serialises publishes and restores per skill, so two can't take the same number and the
  // unchanged check is authoritative. A skill deleted while this waited is gone once the lock is granted, so the
  // caller gets a 404. The name is read under the lock too, so previousName is the name this write replaced, and a
  // restore, which must never rename, can tell that a publish renamed the skill after it read the name.
  const $writeVersion = async ({
    skillId,
    projectId,
    allowRename,
    baseVersion,
    content
  }: {
    skillId: string;
    projectId: string;
    allowRename: boolean;
    baseVersion?: number;
    content: Pick<TAgentVaultSkillVersions, "encryptedFiles" | "sha256" | "sizeBytes" | "fileCount"> & {
      name: string;
      description: string;
    };
  }) => {
    const write = () =>
      agentVaultSkillDAL.transaction(async (tx) => {
        const current = await agentVaultSkillDAL.lockByIdInProject({ id: skillId, projectId }, tx);
        if (!current) throw skillNotFound(skillId);

        const latest = await agentVaultSkillVersionDAL.findLatest(skillId, tx);
        if (latest?.sha256 === content.sha256) {
          const skill = await agentVaultSkillDAL.findSummaryByIdInProject({ id: skillId, projectId }, tx);
          return { skill: skill!, version: latest, unchanged: true, previousName: undefined };
        }

        const latestVersion = latest?.version ?? 0;
        if (baseVersion !== undefined && latestVersion !== baseVersion) {
          throw new ConflictError({
            message: `Version ${latestVersion} was published after you opened this skill. Review it, then save again.`
          });
        }

        const renamed = current.name !== content.name;
        if (renamed && !allowRename) {
          throw new ConflictError({
            message: `Skill '${content.name}' was renamed to '${current.name}' while this version was being restored. Try again.`
          });
        }
        if (renamed) {
          const taken = await agentVaultSkillDAL.findByNameInProject({ name: content.name, projectId }, tx);
          if (taken) throw new ConflictError({ message: duplicateNameMessage(content.name) });
        }

        const next = latestVersion + 1;
        const version = await agentVaultSkillVersionDAL.create(
          {
            skillId,
            version: next,
            encryptedFiles: content.encryptedFiles,
            sha256: content.sha256,
            sizeBytes: content.sizeBytes,
            fileCount: content.fileCount
          },
          tx
        );
        await agentVaultSkillDAL.updateById(
          skillId,
          renamed ? { name: content.name, description: content.description } : { description: content.description },
          tx
        );
        await agentVaultSkillVersionDAL.deleteOlderThan(
          { skillId, version: next - AGENT_VAULT_SKILL_VERSIONS_KEPT + 1 },
          tx
        );
        const skill = await agentVaultSkillDAL.findSummaryByIdInProject({ id: skillId, projectId }, tx);
        return { skill: skill!, version, unchanged: false, previousName: renamed ? current.name : undefined };
      });

    try {
      return await write();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError({ message: duplicateNameMessage(content.name) });
      throw err;
    }
  };

  const updateSkill = async ({ skillId, files, baseVersion, ...scoped }: TUpdateSkillDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultSkillActions.Edit);

    const skill = await $findSkill({ skillId, projectId: scoped.projectId });
    const validated = validateSkillFiles(files);

    // Checked again under the lock. This read only spares an unchanged upload the encrypt.
    const latest = await agentVaultSkillVersionDAL.findLatest(skill.id);
    if (latest?.sha256 === validated.sha256) {
      return { skill: projectSkill(skill), version: projectVersion(latest), unchanged: true };
    }

    const { encryptor } = await getProjectCipher(scoped.projectId);
    const encryptedFiles = encryptor({ plainText: validated.serialized }).cipherTextBlob;

    const written = await $writeVersion({
      skillId: skill.id,
      projectId: scoped.projectId,
      allowRename: true,
      baseVersion,
      content: {
        encryptedFiles,
        sha256: validated.sha256,
        sizeBytes: validated.sizeBytes,
        fileCount: validated.fileCount,
        name: validated.name,
        description: validated.description
      }
    });

    return {
      skill: projectSkill(written.skill),
      version: projectVersion(written.version),
      unchanged: written.unchanged,
      previousName: written.previousName
    };
  };

  const $findVersion = async ({ skill, version }: { skill: TAgentVaultSkillSummaryRow; version: number }) => {
    const row = await agentVaultSkillVersionDAL.findByVersion({ skillId: skill.id, version });
    if (!row) throw new NotFoundError({ message: `Version ${version} of skill '${skill.name}' not found` });
    return row;
  };

  const restoreVersion = async ({ skillId, version, ...scoped }: TSkillVersionDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultSkillActions.Edit);

    const skill = await $findSkill({ skillId, projectId: scoped.projectId });
    const source = await $findVersion({ skill, version });

    // Checked again under the lock. This read only spares restoring the latest content the decrypt.
    const latest = await agentVaultSkillVersionDAL.findLatest(skill.id);
    if (latest?.sha256 === source.sha256) {
      return {
        skill: projectSkill(skill),
        version: projectVersion(latest),
        fromVersion: source.version,
        unchanged: true
      };
    }

    // The description lives on the skill, not the version, so it is read back out of the restored SKILL.md. A
    // version saved under older header rules may no longer parse, and that must not block restoring it.
    const { decryptor, encryptor } = await getProjectCipher(scoped.projectId);
    const files = deserializeSkillFiles(decryptor({ cipherTextBlob: source.encryptedFiles }));
    const manifest = files.find((file) => file.path === AGENT_VAULT_SKILL_MANIFEST);
    let header: { name: string; description: string } | undefined;
    if (manifest) {
      try {
        header = parseSkillHeader(Buffer.from(manifest.contentBase64, "base64"));
      } catch {
        header = undefined;
      }
    }

    let content: Parameters<typeof $writeVersion>[0]["content"] = {
      encryptedFiles: source.encryptedFiles,
      sha256: source.sha256,
      sizeBytes: source.sizeBytes,
      fileCount: source.fileCount,
      name: skill.name,
      description: header?.description ?? skill.description
    };

    // A restore never renames: a version saved under an earlier name gets the current name written into its
    // SKILL.md, so the files an agent installs agree with the skill they came from.
    if (manifest && header && header.name !== skill.name) {
      const rewritten = replaceSkillHeaderName(Buffer.from(manifest.contentBase64, "base64"), skill.name);
      if (!rewritten) {
        throw new BadRequestError({
          message: `Version ${source.version} of skill '${skill.name}' names '${header.name}' in ${AGENT_VAULT_SKILL_MANIFEST}, and its 'name' line could not be changed to '${skill.name}'. Publish a new version instead.`
        });
      }
      const validated = validateSkillFiles(
        files.map((file) => (file === manifest ? { ...file, contentBase64: rewritten.toString("base64") } : file))
      );
      if (validated.name !== skill.name) {
        throw new BadRequestError({
          message: `Version ${source.version} of skill '${skill.name}' could not be restored under its current name. Publish a new version instead.`
        });
      }
      content = {
        encryptedFiles: encryptor({ plainText: validated.serialized }).cipherTextBlob,
        sha256: validated.sha256,
        sizeBytes: validated.sizeBytes,
        fileCount: validated.fileCount,
        name: skill.name,
        description: validated.description
      };
    }

    const written = await $writeVersion({
      skillId: skill.id,
      projectId: scoped.projectId,
      allowRename: false,
      content
    });

    return {
      skill: projectSkill(written.skill),
      version: projectVersion(written.version),
      fromVersion: source.version,
      unchanged: written.unchanged
    };
  };

  const listSkills = async ({ search, name, limit, offset, ...scoped }: TListSkillsDTO) => {
    const accessBundleIds = await $authorizeRead(scoped);

    const { skills, totalCount } = await agentVaultSkillDAL.findForList({
      projectId: scoped.projectId,
      accessBundleIds,
      search,
      name,
      limit,
      offset
    });
    const bundlesBySkill = await agentVaultSkillBundleDAL.findBundlesForSkills(
      skills.map((skill) => skill.id),
      accessBundleIds
    );
    return {
      skills: skills.map((skill): TAgentVaultSkillWithBundles => ({
        ...projectSkill(skill),
        accessBundles: bundlesBySkill.get(skill.id) ?? []
      })),
      totalCount
    };
  };

  // A skill on no bundle the member can reach is a 404, never a 403, which would confirm the id exists.
  const getSkill = async ({ skillId, ...scoped }: TSkillByIdDTO) => {
    const accessBundleIds = await $authorizeRead(scoped);

    const skill = await $findSkill({ skillId, projectId: scoped.projectId });
    const accessBundles = await agentVaultSkillBundleDAL.findBundlesForSkill(skill.id, accessBundleIds);
    if (accessBundleIds && !accessBundles.length) throw skillNotFound(skillId);
    const latest = await $findVersion({ skill, version: skill.latestVersion });

    const { decryptor } = await getProjectCipher(scoped.projectId);
    const files = deserializeSkillFiles(decryptor({ cipherTextBlob: latest.encryptedFiles }));
    return { skill: { ...projectSkill(skill), accessBundles, files }, version: latest.version };
  };

  // Version history is for the people who can publish and restore, so it checks Edit rather than Read.
  const listVersions = async ({ skillId, ...scoped }: TSkillByIdDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultSkillActions.Edit);

    const skill = await $findSkill({ skillId, projectId: scoped.projectId });
    const versions = await agentVaultSkillVersionDAL.findBySkillId(skill.id);
    return { versions: versions.map(projectVersion) };
  };

  // A member reads only the latest version of a skill they can reach; anything else is a 404, as for a skill or
  // version that does not exist.
  const getVersionFiles = async ({ skillId, version, ...scoped }: TSkillVersionDTO) => {
    const accessBundleIds = await $authorizeRead(scoped);

    const skill = await $findSkill({ skillId, projectId: scoped.projectId });
    if (accessBundleIds) {
      if (!(await agentVaultSkillBundleDAL.isSkillReachable(skill.id, accessBundleIds))) throw skillNotFound(skillId);
      if (version !== skill.latestVersion) {
        throw new NotFoundError({ message: `Version ${version} of skill '${skill.name}' not found` });
      }
    }
    const row = await $findVersion({ skill, version });

    const { decryptor } = await getProjectCipher(scoped.projectId);
    const files = deserializeSkillFiles(decryptor({ cipherTextBlob: row.encryptedFiles }));
    return { skill: projectSkill(skill), version: { ...projectVersion(row), files } };
  };

  // The bundle links go with the skill through the foreign key; their names are returned for the audit event.
  const deleteSkill = async ({ skillId, ...scoped }: TSkillByIdDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultSkillActions.Delete);

    return agentVaultSkillDAL.transaction(async (tx) => {
      const locked = await agentVaultSkillDAL.lockByIdInProject({ id: skillId, projectId: scoped.projectId }, tx);
      if (!locked) throw skillNotFound(skillId);

      const skill = await agentVaultSkillDAL.findSummaryByIdInProject(
        { id: locked.id, projectId: scoped.projectId },
        tx
      );
      const accessBundles = await agentVaultSkillBundleDAL.findBundlesForSkill(locked.id, null, tx);
      await agentVaultSkillDAL.deleteById(locked.id, tx);

      return { skill: projectSkill(skill!), removedFromBundles: accessBundles };
    });
  };

  const toBundleSkill = (
    skill: { id: string; name: string; description: string },
    latest: TAgentVaultSkillVersionRow | undefined
  ): TAgentVaultBundleSkill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    latestVersion: latest?.version ?? 0
  });

  // A bundle the caller cannot reach is a 404, as in the access bundle service.
  const listBundleSkills = async ({ accessBundleId, ...scoped }: TBundleSkillsDTO) => {
    const accessBundleIds = await $authorizeRead(scoped);

    const bundle = await agentVaultAccessBundleDAL.findByIdInProject({
      id: accessBundleId,
      projectId: scoped.projectId
    });
    // Postgres compares uuids case-insensitively but this list does not, so an uppercase id would miss.
    if (!bundle || (accessBundleIds && !accessBundleIds.includes(accessBundleId.toLowerCase()))) {
      throw bundleNotFound(accessBundleId);
    }

    return { skills: await agentVaultSkillBundleDAL.findSkillsForBundle(bundle.id) };
  };

  // The bundle is locked first, as every other bundle write does, then the skill, so a skill delete can't run
  // between the check and the insert.
  const addToBundle = async ({ accessBundleId, skillId, ...scoped }: TBundleSkillDTO) => {
    await $authorizeBundleLink(scoped);

    const add = () =>
      agentVaultSkillDAL.transaction(async (tx) => {
        const bundle = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: accessBundleId, projectId: scoped.projectId },
          tx
        );
        if (!bundle) throw bundleNotFound(accessBundleId);

        const skill = await agentVaultSkillDAL.lockByIdInProject({ id: skillId, projectId: scoped.projectId }, tx);
        if (!skill) throw skillNotFound(skillId);

        const existing = await agentVaultSkillBundleDAL.findOne({ accessBundleId: bundle.id, skillId: skill.id }, tx);
        if (existing) {
          throw new ConflictError({
            message: `The skill '${skill.name}' is already in the access bundle '${bundle.name}'.`
          });
        }

        const bundleSkillCount = await agentVaultSkillBundleDAL.countForBundle(bundle.id, tx);
        if (bundleSkillCount >= AGENT_VAULT_MAX_SKILLS_PER_BUNDLE) {
          throw new BadRequestError({
            message: `This access bundle already has ${AGENT_VAULT_MAX_SKILLS_PER_BUNDLE} skills, the maximum. Remove one to add another.`
          });
        }

        await agentVaultSkillBundleDAL.create({ accessBundleId: bundle.id, skillId: skill.id }, tx);
        const latest = await agentVaultSkillVersionDAL.findLatest(skill.id, tx);
        return { skill: toBundleSkill(skill, latest), accessBundle: { id: bundle.id, name: bundle.name } };
      });

    try {
      return await add();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError({ message: "This skill is already in this access bundle." });
      }
      throw err;
    }
  };

  const removeFromBundle = async ({ accessBundleId, skillId, ...scoped }: TBundleSkillDTO) => {
    await $authorizeBundleLink(scoped);

    return agentVaultSkillDAL.transaction(async (tx) => {
      const bundle = await agentVaultAccessBundleDAL.lockByIdInProject(
        { id: accessBundleId, projectId: scoped.projectId },
        tx
      );
      if (!bundle) throw bundleNotFound(accessBundleId);

      const skill = await agentVaultSkillDAL.findOne({ id: skillId, projectId: scoped.projectId }, tx);
      if (!skill) throw skillNotFound(skillId);

      const [removed] = await agentVaultSkillBundleDAL.delete({ accessBundleId: bundle.id, skillId: skill.id }, tx);
      if (!removed) {
        throw new NotFoundError({
          message: `The skill '${skill.name}' isn't in the access bundle '${bundle.name}'.`
        });
      }

      const latest = await agentVaultSkillVersionDAL.findLatest(skill.id, tx);
      return { skill: toBundleSkill(skill, latest), accessBundle: { id: bundle.id, name: bundle.name } };
    });
  };

  return {
    createSkill,
    updateSkill,
    restoreVersion,
    listSkills,
    getSkill,
    listVersions,
    getVersionFiles,
    deleteSkill,
    listBundleSkills,
    addToBundle,
    removeFromBundle
  };
};
