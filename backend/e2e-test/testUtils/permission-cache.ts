// Clears every actor's cached permissions in the projects, so a spec sees a role change without waiting out the
// cache's 10s marker.
export const clearPermissionCaches = async (projectIds: string[]) => {
  const domainKeys = (
    await Promise.all(
      projectIds.flatMap((projectId) => [
        testRedis.keys(`*access-control:actor-grants:*:${projectId}:*`),
        testRedis.keys(`*projects:project:*:${projectId}:*`),
        testRedis.keys(`*secrets:folder-grants:*:${projectId}:*`)
      ])
    )
  ).flat();
  if (domainKeys.length) await testRedis.del(...domainKeys);
};
