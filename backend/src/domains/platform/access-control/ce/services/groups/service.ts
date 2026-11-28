import { TGrantStore, TGroup } from "../dependencies";

export type TGroupService = {
  findGroupsByIds(input: { ids: string[] }): Promise<TGroup[]>;
};

export class GroupService implements TGroupService {
  constructor(private readonly grantStore: TGrantStore) {}

  findGroupsByIds({ ids }: { ids: string[] }) {
    return this.grantStore.findGroupsByIds(ids);
  }
}
