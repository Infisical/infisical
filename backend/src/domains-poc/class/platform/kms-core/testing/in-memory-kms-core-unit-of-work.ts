import { TKmsCoreRepositories, TKmsCoreUnitOfWork } from "../repository/unit-of-work";

export class InMemoryKmsCoreUnitOfWork implements TKmsCoreUnitOfWork {
  constructor(private readonly repositories: TKmsCoreRepositories) {}

  run<T>(work: (repositories: TKmsCoreRepositories) => Promise<T>) {
    return work(this.repositories);
  }
}
