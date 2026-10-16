# Backend Documentation

This directory contains technical documentation for the Infisical backend.

## Available Documentation

### Session Management
- **[SESSION_MANAGEMENT.md](./SESSION_MANAGEMENT.md)** - Comprehensive guide to the backend's session architecture
  - Redis-backed session implementation
  - OIDC and OAuth authentication flows
  - Organization slug state transfer mechanism
  - Security best practices and configuration

- **[SESSION_QUICK_REFERENCE.md](./SESSION_QUICK_REFERENCE.md)** - Quick reference for common session management questions
  - What the backend uses for server sessions
  - OIDC organization slug state transfer
  - Key configuration values
  - Code locations

## Contributing

When adding new documentation:
1. Place files in this directory (`/backend/docs/`)
2. Update this README with links to new documentation
3. Use clear headings and code examples
4. Include implementation references (file paths and line numbers)
