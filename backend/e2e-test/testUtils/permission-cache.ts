// Drops the cached permissions of every actor in the projects, in the legacy engine and in the domains, so the next
// check reads the database: what a spec does to see a role change before the cache's 10 second marker would have
// expired. The legacy engine's keys are passed in; the domains' keys are found by project.
export const clearPermissionCaches = async (legacyKeys: string[], projectIds: string[]) => {
  const domainKeys = (
    await Promise.all(
      projectIds.flatMap((projectId) => [
        testRedis.keys(`*access-control:actor-grants:*:${projectId}:*`),
        testRedis.keys(`*projects:project:*:${projectId}`),
        testRedis.keys(`*secrets:folder-grants:*:${projectId}:*`)
      ])
    )
  ).flat();
  const keys = [...legacyKeys, ...domainKeys];
  if (keys.length) await testRedis.del(...keys);
};
