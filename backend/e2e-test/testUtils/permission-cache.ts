// Drops the cached permissions of every actor in the projects, so the next check reads the database: what a spec
// does to see a role change before the cache's 10 second marker would have expired.
export const clearPermissionCaches = async (projectIds: string[]) => {
  const domainKeys = (
    await Promise.all(
      projectIds.flatMap((projectId) => [
        testRedis.keys(`*access-control:actor-grants:*:${projectId}:*`),
        testRedis.keys(`*projects:project:*:${projectId}`),
        testRedis.keys(`*secrets:folder-grants:*:${projectId}:*`)
      ])
    )
  ).flat();
  if (domainKeys.length) await testRedis.del(...domainKeys);
};
