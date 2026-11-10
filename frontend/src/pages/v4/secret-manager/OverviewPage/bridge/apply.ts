import { isAxiosError } from "axios";

import { SecretType } from "@app/hooks/api/secrets/types";
import type { WsTag } from "@app/hooks/api/tags/types";

import { useV4Adapter } from "../../../data/adapters";
import type { Resource, ResourceApplyOptions, Secret } from "../secrets-model";

const childPath = (path: string, name: string) => `${path === "/" ? "" : path}/${name}`;

type Of<K extends Resource["kind"]> = Extract<Resource, { kind: K }>;
export type KindHandler<K extends Resource["kind"]> = {
  create?: (resource: Of<K>) => Promise<unknown>;
  update?: (before: Of<K>, after: Of<K>) => Promise<unknown>;
  remove?: (resource: Of<K>) => Promise<unknown>;
};
export type KindHandlers = {
  [K in "dynamic" | "rotation" | "honey" | "proxy"]?: KindHandler<K>;
};
export type SecretHooks = {
  reminder?: (before: Secret, after: Secret) => Promise<unknown>;
};

export type ApplyScope = { environment: string; path: string };
export type ApplyResult = { written: ApplyScope[]; held: ApplyScope[] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const within = (path: string, root: string) => path === root || path.startsWith(`${root}/`);
const groupBy = <T>(items: T[], key: (item: T) => string) =>
  items.reduce<Record<string, T[]>>((groups, item) => {
    const id = key(item);
    return { ...groups, [id]: [...(groups[id] ?? []), item] };
  }, {});
const scopeOf = (resource: Resource) => `${resource.environment}\u0000${resource.path}`;
const valueOf = (secret: Secret) =>
  secret.value.status === "present" ? secret.value.value : undefined;

export const useEnsureTags = (projectId: string, tags: readonly WsTag[]) => {
  const createTag = useV4Adapter("secrets").useCreateTag();
  return async (slugs: string[]) => {
    const missing = [...new Set(slugs.filter((slug) => !tags.some((tag) => tag.slug === slug)))];
    const created = await Promise.all(
      missing.map((slug) =>
        createTag
          .mutateAsync({ projectId, tagSlug: slug, tagColor: "" })
          .catch((error: unknown) => {
            const reason = isAxiosError<{ message?: string }>(error)
              ? error.response?.data?.message
              : undefined;
            throw new Error(`Could not create the tag ${slug}.${reason ? ` ${reason}` : ""}`);
          })
      )
    );
    return [...tags, ...created];
  };
};

export const useResourceApply = ({
  projectId,
  projectSlug,
  tags,
  handlers = {},
  secretHooks = {}
}: {
  projectId: string;
  projectSlug: string;
  tags: readonly WsTag[];
  handlers?: KindHandlers;
  secretHooks?: SecretHooks;
}) => {
  const adapter = useV4Adapter("secrets");
  const createSecret = adapter.useCreateSecret();
  const updateSecret = adapter.useUpdateSecret();
  const deleteSecret = adapter.useDeleteSecret();
  const createSecretBatch = adapter.useCreateSecretBatch();
  const deleteSecretBatch = adapter.useDeleteSecretBatch();
  const moveSecrets = adapter.useMoveSecrets();
  const createFolder = adapter.useCreateFolder();
  const updateFolder = adapter.useUpdateFolder();
  const deleteFolder = adapter.useDeleteFolder();
  const moveFolder = adapter.useMoveFolder();
  const createImport = adapter.useCreateSecretImport();
  const deleteImport = adapter.useDeleteSecretImport();
  const resyncImport = adapter.useResyncSecretImport();
  const ensureTags = useEnsureTags(projectId, tags);

  return async (
    before: readonly Resource[],
    after: readonly Resource[],
    { shouldOverwrite = false }: ResourceApplyOptions = {}
  ): Promise<ApplyResult> => {
    const result: ApplyResult = { written: [], held: [] };
    const record = async (environment: string, path: string, pending?: Promise<unknown>) => {
      if (!pending) return;
      const response = await pending;
      const held = typeof response === "object" && response !== null && "approval" in response;
      result[held ? "held" : "written"].push({ environment, path });
    };
    const previous = new Map(
      before.map((resource) => [`${resource.kind}:${resource.id}`, resource])
    );
    const next = new Map(after.map((resource) => [`${resource.kind}:${resource.id}`, resource]));
    const created = after.filter((resource) => !previous.has(`${resource.kind}:${resource.id}`));
    const removed = before.filter((resource) => !next.has(`${resource.kind}:${resource.id}`));
    const changed = after
      .map((resource) => [previous.get(`${resource.kind}:${resource.id}`), resource] as const)
      .filter(
        (pair): pair is readonly [Resource, Resource] => Boolean(pair[0]) && !same(pair[0], pair[1])
      );

    const createdSecrets = created.filter(
      (resource): resource is Secret =>
        resource.kind === "secret" && !resource.managedBy && !resource.honeyToken
    );
    if (createdSecrets.some((secret) => valueOf(secret) === undefined))
      throw new Error("Load all selected secret values before creating secrets.");
    const secretChanges = changed.filter(
      (pair): pair is readonly [Secret, Secret] =>
        pair[0].kind === "secret" && !pair[0].managedBy && !pair[0].honeyToken
    );

    const knownTags = await ensureTags(
      [...createdSecrets, ...secretChanges.map(([, to]) => to)].flatMap((secret) => secret.tags)
    );
    const tagIds = (slugs: string[]) =>
      slugs.flatMap((slug) => knownTags.filter((tag) => tag.slug === slug).map((tag) => tag.id));

    const folderMoves = changed
      .filter(
        (pair): pair is readonly [Of<"folder">, Of<"folder">] =>
          pair[0].kind === "folder" &&
          (pair[0].name !== pair[1].name ||
            pair[0].path !== pair[1].path ||
            pair[0].environment !== pair[1].environment)
      )
      .map(([from, to]) => ({
        environment: from.environment,
        from: childPath(from.path, from.name),
        toEnvironment: to.environment,
        to: childPath(to.path, to.name)
      }));
    const implied = (from: Resource, to: Resource) =>
      folderMoves.some(
        (move) =>
          from.environment === move.environment &&
          within(from.path, move.from) &&
          to.environment === move.toEnvironment &&
          to.path === move.to + from.path.slice(move.from.length)
      );
    if (
      changed.some(
        ([from, to]) =>
          from.kind === "rotation" &&
          (from.path !== to.path || from.environment !== to.environment) &&
          !implied(from, to)
      )
    )
      throw new Error("Moving secret rotations is not supported here yet.");

    const removedFolders = removed.filter((resource) => resource.kind === "folder");
    const insideRemoved = (resource: Resource) =>
      removedFolders.some(
        (folder) =>
          folder.environment === resource.environment &&
          within(resource.path, childPath(folder.path, folder.name))
      );

    const removedSecrets = removed.filter(
      (resource): resource is Secret =>
        resource.kind === "secret" &&
        !insideRemoved(resource) &&
        !resource.managedBy &&
        !resource.honeyToken
    );
    await Promise.all(
      Object.values(groupBy(removedSecrets, scopeOf)).map((group) =>
        record(
          group[0].environment,
          group[0].path,
          deleteSecretBatch.mutateAsync({
            projectId,
            environment: group[0].environment,
            secretPath: group[0].path,
            secrets: group.map((secret) => ({ secretKey: secret.name, type: SecretType.Shared }))
          })
        )
      )
    );
    await Promise.all(
      removed.map((resource) => {
        if (insideRemoved(resource) || resource.kind === "secret") return undefined;
        if (resource.kind === "folder")
          return record(
            resource.environment,
            resource.path,
            deleteFolder.mutateAsync({
              projectId,
              environment: resource.environment,
              folderId: resource.id,
              path: resource.path
            })
          );
        if (resource.kind === "import")
          return record(
            resource.environment,
            resource.path,
            deleteImport.mutateAsync({
              id: resource.id,
              projectId,
              environment: resource.environment,
              path: resource.path
            })
          );
        return record(
          resource.environment,
          resource.path,
          (handlers[resource.kind]?.remove as ((item: Resource) => Promise<unknown>) | undefined)?.(
            resource
          )
        );
      })
    );

    await changed
      .filter(
        (pair): pair is readonly [Of<"folder">, Of<"folder">] =>
          pair[0].kind === "folder" && pair[1].kind === "folder" && !implied(pair[0], pair[1])
      )
      .reduce(
        (chain, [from, to]) =>
          chain
            .then(() =>
              from.path !== to.path || from.environment !== to.environment
                ? record(
                    to.environment,
                    to.path,
                    moveFolder.mutateAsync({
                      projectId,
                      folderId: from.id,
                      sourceEnvironment: from.environment,
                      sourcePath: from.path,
                      destinationEnvironment: to.environment,
                      destinationPath: to.path
                    })
                  )
                : undefined
            )
            .then(() =>
              from.name !== to.name || from.description !== to.description
                ? record(
                    to.environment,
                    to.path,
                    updateFolder.mutateAsync({
                      projectId,
                      environment: to.environment,
                      folderId: to.id,
                      name: to.name,
                      description: to.description,
                      path: to.path
                    })
                  )
                : undefined
            ),
        Promise.resolve<unknown>(undefined)
      );

    const createdFolders = created.filter(
      (resource): resource is Of<"folder"> => resource.kind === "folder"
    );
    const depth = (resource: Resource) => resource.path.split("/").filter(Boolean).length;
    await [...createdFolders]
      .sort((a, b) => depth(a) - depth(b))
      .reduce(
        (chain, folder) =>
          chain.then(() =>
            record(
              folder.environment,
              folder.path,
              createFolder.mutateAsync({
                projectId,
                environment: folder.environment,
                name: folder.name,
                path: folder.path,
                description: folder.description
              })
            )
          ),
        Promise.resolve<unknown>(undefined)
      );

    const movedSecrets = changed.filter(
      (pair): pair is readonly [Secret, Secret] =>
        pair[0].kind === "secret" &&
        (pair[0].path !== pair[1].path || pair[0].environment !== pair[1].environment) &&
        !implied(pair[0], pair[1])
    );
    await Promise.all(
      Object.values(
        groupBy(movedSecrets, ([from, to]) => `${scopeOf(from)}\u0000${scopeOf(to)}`)
      ).map(async (group) => {
        const [from, to] = group[0];
        const response = (await moveSecrets.mutateAsync({
          projectId,
          projectSlug,
          sourceEnvironment: from.environment,
          sourceSecretPath: from.path,
          destinationEnvironment: to.environment,
          destinationSecretPath: to.path,
          secretIds: group.map(([secret]) => secret.id),
          shouldOverwrite
        })) as { isSourceUpdated?: boolean; isDestinationUpdated?: boolean } | undefined;
        result[response?.isDestinationUpdated === false ? "held" : "written"].push({
          environment: to.environment,
          path: to.path
        });
        result[response?.isSourceUpdated === false ? "held" : "written"].push({
          environment: from.environment,
          path: from.path
        });
      })
    );

    await Promise.all(
      Object.values(groupBy(createdSecrets, scopeOf)).map((group) =>
        record(
          group[0].environment,
          group[0].path,
          createSecretBatch.mutateAsync({
            projectId,
            environment: group[0].environment,
            secretPath: group[0].path,
            secrets: group.map((secret) => ({
              secretKey: secret.name,
              secretValue: valueOf(secret) ?? "",
              secretComment: secret.comment,
              skipMultilineEncoding: secret.skipMultilineEncoding,
              tagIds: tagIds(secret.tags),
              secretMetadata: secret.metadata.map((entry) => ({
                key: entry.key,
                value: entry.value,
                isEncrypted: entry.encrypted
              })),
              type: SecretType.Shared
            }))
          })
        )
      )
    );

    await Promise.all(
      secretChanges.map(async ([from, to]) => {
        const scope = {
          projectId,
          environment: to.environment,
          secretPath: to.path,
          secretKey: from.name
        };
        const value = valueOf(to);
        const patch = {
          ...(from.name !== to.name ? { newSecretName: to.name } : {}),
          ...(value !== undefined && value !== valueOf(from) ? { secretValue: value } : {}),
          ...(from.comment !== to.comment ? { secretComment: to.comment } : {}),
          ...(!same([...from.tags].sort(), [...to.tags].sort()) ? { tagIds: tagIds(to.tags) } : {}),
          ...(!same(from.metadata, to.metadata)
            ? {
                secretMetadata: to.metadata.map((entry) => ({
                  key: entry.key,
                  value: entry.value,
                  isEncrypted: entry.encrypted
                }))
              }
            : {}),
          ...(Boolean(from.skipMultilineEncoding) !== Boolean(to.skipMultilineEncoding)
            ? { skipMultilineEncoding: Boolean(to.skipMultilineEncoding) }
            : {})
        };
        if (Object.keys(patch).length)
          await record(
            to.environment,
            to.path,
            updateSecret.mutateAsync({ ...scope, ...patch, type: SecretType.Shared })
          );
        const personal = { ...scope, secretKey: to.name };
        if (from.override === undefined && to.override !== undefined)
          await record(
            to.environment,
            to.path,
            createSecret.mutateAsync({
              ...personal,
              secretValue: to.override,
              secretComment: "",
              type: SecretType.Personal
            })
          );
        else if (from.override !== undefined && to.override === undefined)
          await record(
            to.environment,
            to.path,
            deleteSecret.mutateAsync({ ...personal, type: SecretType.Personal })
          );
        else if (to.override !== undefined && from.override !== to.override)
          await record(
            to.environment,
            to.path,
            updateSecret.mutateAsync({
              ...personal,
              secretValue: to.override,
              type: SecretType.Personal
            })
          );
        if (!same(from.reminder, to.reminder))
          await record(to.environment, to.path, secretHooks.reminder?.(from, to));
      })
    );

    await Promise.all(
      created.map((resource) => {
        if (resource.kind === "import")
          return record(
            resource.environment,
            resource.path,
            createImport.mutateAsync({
              projectId,
              environment: resource.environment,
              path: resource.path,
              import: {
                environment: resource.source.environment,
                path: resource.source.path,
                ...(resource.source.project !== projectId
                  ? { sourceProjectId: resource.source.project }
                  : {})
              },
              isReplication: resource.replicated
            })
          );
        if (resource.kind === "secret" || resource.kind === "folder") return undefined;
        return record(
          resource.environment,
          resource.path,
          (handlers[resource.kind]?.create as ((item: Resource) => Promise<unknown>) | undefined)?.(
            resource
          )
        );
      })
    );
    await Promise.all(
      changed.map(([from, to]) => {
        if (from.kind === "import" && to.kind === "import") {
          if (
            from.lastReplicated !== to.lastReplicated ||
            from.replicationStatus !== to.replicationStatus
          )
            return record(
              to.environment,
              to.path,
              resyncImport.mutateAsync({
                id: to.id,
                projectId,
                environment: to.environment,
                path: to.path
              })
            );
          return undefined;
        }
        if (from.kind === "secret" || from.kind === "folder" || from.kind === "import")
          return undefined;
        if (implied(from, to)) return undefined;
        return record(
          to.environment,
          to.path,
          (
            handlers[from.kind]?.update as
              | ((a: Resource, b: Resource) => Promise<unknown>)
              | undefined
          )?.(from, to)
        );
      })
    );
    return result;
  };
};
