// Regression test for GitLab finding URL host resolution
import { describe, it, expect, vi } from 'vitest';

vi.mock('@app/lib/config/request', () => ({
  request: {
    post: vi.fn().mockResolvedValue({ data: {} })
  }
}));


vi.mock('@app/services/app-connection/gitlab/gitlab-connection-fns', () => ({
  getGitLabConnectionClient: vi.fn().mockResolvedValue({
    Commits: {
      showDiff: vi.fn().mockResolvedValue([
        {
          newPath: 'path/to/file.txt',
          diff: '+ secret: abcdef',
        }
      ])
    },
    Projects: { show: vi.fn().mockResolvedValue({}) },
    Users: { showCurrentUser: vi.fn().mockResolvedValue({ username: 'gituser' }) },
    // add other needed mocks if any
  }),
  getGitLabInstanceUrl: vi.fn().mockResolvedValue('https://git.gitlab.com/')
}));

// Mock config env to avoid blockLocalAndPrivateIpAddresses failing
vi.mock('@app/lib/config/env', () => ({
  getConfig: () => ({
    isDevelopmentMode: true,
    ALLOW_INTERNAL_IP_CONNECTIONS: false,
  })
}));


// Mock scanContentAndGetFindings to avoid spawning the infisical CLI
vi.mock('../../secret-scanning/secret-scanning-queue/secret-scanning-fns', () => ({
  scanContentAndGetFindings: vi.fn().mockResolvedValue([
    {
      RuleID: 'TEST_RULE',
      StartLine: 1,
      EndLine: 1,
      StartColumn: 1,
      EndColumn: 1,
      Attributes: {}
    }
  ])
}));



// Mock utility function
vi.mock('./util', () => ({
  convertPatchLineToFileLineNumber: vi.fn().mockReturnValue(1)
}));
vi.mock('../../../../lib/crypto/cryptography', () => ({
  crypto: { nativeCrypto: require('node:crypto') }
}));

import gitlabSecretScanningFactory from './gitlab-secret-scanning-factory';

describe('GitLab finding URL uses validated host', () => {
  it('produces URL with self‑hosted instance domain', async () => {
    const factory = await gitlabSecretScanningFactory({
      appConnectionDAL: {} as any,
      kmsService: {} as any
    });

    const payload = {
      commits: [
        {
          id: 'abc123',
          author: { name: 'Alice', email: 'alice@example.com' },
          timestamp: '2023-01-01T00:00:00Z',
          message: 'test commit'
        }
      ],
      project: { id: 42, path_with_namespace: 'group/project' }
    } as any;

    const findings = await (factory.getDiffScanFindingsPayload as any)({
      dataSource: {
        connection: {
          credentials: { instanceUrl: 'https://git.gitlab.com' }
        }
      } as any,
      payload,
      resourceName: 'project',
      configPath: ''
    });

    // The factory returns an array of finding objects wrapped with details
    const link = findings[0].details?.link as string;
    expect(link).toContain('https://git.gitlab.com/');
    expect(link).not.toContain('https://gitlab.com/');
  });
});
