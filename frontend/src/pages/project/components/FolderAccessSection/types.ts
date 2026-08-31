export type TFolderAccessSectionActor =
  | {
      type: "user";
      id: string;
      membershipId: string | null;
      username: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  | {
      type: "identity";
      id: string;
      name: string;
    };
