import { defineAbility } from '@casl/ability';

export const defineWorkspaceAbilityFor = (user: any) => defineAbility((can) => {
  // can('manage', 'all');
  // console.log("workspace ===>", workspace)

  // if (user) {
  can(["read", "delete", "update"], "Workspace", { name: "Example Projects" })
  // }

  // if (user.isLoggedIn) {
  //   can('update', 'Article', { authorId: user.id });
  //   can('create', 'Comment');
  //   can('update', 'Comment', { authorId: user.id });
  // }
});