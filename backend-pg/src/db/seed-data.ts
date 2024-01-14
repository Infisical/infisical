export const seedData1 = {
  id: "3dafd81d-4388-432b-a4c5-f735616868c1",
  email: "test@localhost.local",
  password: process.env.TEST_USER_PASSWORD || "testInfisical@1",
  organization: {
    id: "180870b7-f464-4740-8ffe-9d11c9245ea7",
    name: "infisical"
  },
  project: {
    id: "77fa7aed-9288-401e-a4c9-3a9430be62a0",
    name: "first project"
  },
  token: {
    id: "a9dfafba-a3b7-42e3-8618-91abb702fd36"
  }
};
