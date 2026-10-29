import { TSecretSharingRepositories, TSecretSharingUnitOfWork } from "../repository/unit-of-work";

export class InMemorySecretSharingUnitOfWork implements TSecretSharingUnitOfWork {
  constructor(private readonly repositories: TSecretSharingRepositories) {}

  run<T>(work: (repositories: TSecretSharingRepositories) => Promise<T>) {
    return work(this.repositories);
  }
}
