<h1 align="center">Infisical</h1>
<p align="center">
  <p align="center"><b>The open-source secret management platform</b>: Sync secrets/configs across your team/infrastructure and prevent secret leaks.</p>
</p>

<h4 align="center">
  <a href="https://infisical.com/slack">Slack</a> |
  <a href="https://infisical.com/">Infisical Cloud</a> |
  <a href="https://infisical.com/docs/self-hosting/overview">Self-Hosting</a> |
  <a href="https://infisical.com/docs/documentation/getting-started/introduction">Docs</a> |
  <a href="https://www.infisical.com">Website</a> |
  <a href="https://infisical.com/careers">Hiring (Remote/SF)</a>
</h4>


<h4 align="center">
  <a href="https://github.com/Infisical/infisical/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="Infisical is released under the MIT license." />
  </a>
  <a href="https://github.com/infisical/infisical/blob/main/CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs welcome!" />
  </a>
  <a href="https://github.com/Infisical/infisical/issues">
    <img src="https://img.shields.io/github/commit-activity/m/infisical/infisical" alt="git commit activity" />
  </a>
  <a href="https://cloudsmith.io/~infisical/repos/">
    <img src="https://img.shields.io/badge/Downloads-6.95M-orange" alt="Cloudsmith downloads" />
  </a>
  <a href="https://infisical.com/slack">
    <img src="https://img.shields.io/badge/chat-on%20Slack-blueviolet" alt="Slack community channel" />
  </a>
  <a href="https://twitter.com/infisical">
    <img src="https://img.shields.io/twitter/follow/infisical?label=Follow" alt="Infisical Twitter" />
  </a>
</h4>

### Introduction

**[Infisical](https://infisical.com)** is the open source secret management platform that teams use to centralize their application configuration and secrets like API keys and database credentials as well as manage their internal PKI.

We're on a mission to make security tooling more accessible to everyone, not just security teams, and that means redesigning the entire developer experience from ground up.


### Installation

The Infisical CLI NPM package serves as a new installation method in addition to our [existing installation methods](https://infisical.com/docs/cli/overview).

After installing the CLI with the command below, you'll be able to use the infisical CLI across your machine.

```bash
$ npm install -g @infisical/cli
```

Full example:
```bash
# Install the Infisical CLI
$ npm install -g @infisical/cli

# Authenticate with the Infisical CLI
$ infisical login 

# Initialize your Infisical CLI
$ infisical init

# List your secrets with Infisical CLI
$ infisical secrets
```


### Documentation
Our full CLI documentation can be found [here](https://infisical.com/docs/cli/usage).