import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Secret } from './entities/secret.entity';

@Injectable()
export class SecretService {
  constructor(
    @InjectRepository(Secret)
    private readonly secretRepository: Repository<Secret>,
  ) {}

  async createSecret(createSecretDto: any) {
    const secret = new Secret();
    secret.key = createSecretDto.key.toUpperCase(); // Auto capitalize the key
    secret.value = createSecretDto.value;
    return this.secretRepository.save(secret);
  }

  // Rest of the code remains the same
}