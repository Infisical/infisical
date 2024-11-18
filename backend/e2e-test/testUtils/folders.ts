type TFolder = {
  id: string;
  name: string;
};

export const createFolder = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  name: string;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/folders`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    body: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      name: dto.name,
      path: dto.secretPath
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder as TFolder;
};

export const deleteFolder = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  id: string;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/folders/${dto.id}`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    body: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      path: dto.secretPath
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folder as TFolder;
};

export const listFolders = async (dto: {
  workspaceId: string;
  environmentSlug: string;
  secretPath: string;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/folders`,
    headers: {
      authorization: `Bearer ${dto.authToken}`
    },
    body: {
      workspaceId: dto.workspaceId,
      environment: dto.environmentSlug,
      path: dto.secretPath
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().folders as TFolder[];
};
