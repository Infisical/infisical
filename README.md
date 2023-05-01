<h1 align="center">
  <img width="300" src="/img/logoname-black.svg#gh-light-mode-only" alt="infisical">
  <img width="300" src="/img/logoname-white.svg#gh-dark-mode-only" alt="infisical">
</h1>
<p align="center">
  <p align="center">Open-source, end-to-end encrypted platform to manage secrets and configs across your team and infrastructure.</p>
</p>

<h4 align="center">
  <a href="https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g">Slack</a> |
  <a href="https://infisical.com/">Infisical Cloud</a> |
  <a href="https://infisical.com/docs/self-hosting/overview">Self-Hosting</a> |
  <a href="https://infisical.com/docs/documentation/getting-started/introduction">Docs</a> |
  <a href="https://www.infisical.com">Website</a>
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
    <img src="https://img.shields.io/badge/Downloads-150.8k-orange" alt="Cloudsmith downloads" />
  </a>
  <a href="https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g">
    <img src="https://img.shields.io/badge/chat-on%20Slack-blueviolet" alt="Slack community channel" />
  </a>
  <a href="https://twitter.com/infisical">
    <img src="https://img.shields.io/twitter/follow/infisical?label=Follow" alt="Infisical Twitter" />
  </a>
</h4>

<img src="/img/infisical_github_repo.png" width="100%" alt="Dashboard" />

## Introduction

**[Infisical](https://infisical.com)** is an open source, end-to-end encrypted secret management platform that teams use to centralize their secrets like API keys, database credentials, and configurations.

We're on a mission to make secret management more accessible to everyone, not just security teams, and that means redesigning the entire developer experience from ground up.

## Features

-   **[User-friendly dashboard](https://infisical.com/docs/documentation/platform/project)** to manage secrets across projects and environments (e.g. development, production, etc.)
- **[Client SDKs](https://infisical.com/docs/sdks/overview)** to fetch secrets for your apps and infrastructure on demand
-   **[Infisical CLI](https://infisical.com/docs/cli/overview)** to fetch and inject secrets into any framework in local development
-   **[Native integrations](https://infisical.com/docs/integrations/overview)** with platforms like GitHub, Vercel, Netlify, and more
- [**Automatic Kubernetes deployment secret reloads**](https://infisical.com/docs/documentation/getting-started/kubernetes)
-   **[Complete control over your data](https://infisical.com/docs/self-hosting/overview)** - host it yourself on any infrastructure
-   **[Secret versioning](https://infisical.com/docs/documentation/platform/secret-versioning)** and **[Point-in-Time Recovery]()** to version every secret and project state
-   **[Audit logs](https://infisical.com/docs/documentation/platform/audit-logs)** to record every action taken in a project
-   **Role-based Access Controls** per environment
-   [**Simple on-premise deployments** to AWS and Digital Ocean](https://infisical.com/docs/self-hosting/overview)
- [**2FA**](https://infisical.com/docs/documentation/platform/mfa) with more options coming soon

And much more.

## Getting started

Check out the [Quickstart](https://infisical.com/docs/getting-started/introduction) Guides

### Use Infisical Cloud

The fastest and most reliable way to get started with Infisical is signing up for free to [Infisical Cloud](https://app.infisical.com/login).

### Deploy Infisical on premise

Deployment options: [AWS EC2](https://infisical.com/docs/self-hosting/overview), [Kubernetes](https://infisical.com/docs/self-hosting/overview), and [more](https://infisical.com/docs/self-hosting/overview).

### Run Infisical locally

To set up and run Infisical locally, make sure you have Git and Docker installed on your system. Then run the command for your system:

Linux/macOS:

```console
git clone https://github.com/Infisical/infisical && cd "$(basename $_ .git)" && cp .env.example .env && docker-compose -f docker-compose.dev.yml up --build
```

Windows Command Prompt:

```console
git clone https://github.com/Infisical/infisical && cd infisical && copy .env.example .env && docker-compose -f docker-compose.dev.yml up --build
```

Login to the web app at `http://localhost:8080` by entering the test user email `test@localhost.local` and password `testInfisical1`.

## Open-source vs. paid

This repo available under the [MIT expat license](https://github.com/Infisical/infisical/blob/main/LICENSE), with the exception of the `ee` directory which will contain premium enterprise features requiring a Infisical license in the future. 

## Security

Please do not file GitHub issues or post on our public forum for security vulnerabilities, as they are public!

Infisical takes security issues very seriously. If you have any concerns about Infisical or believe you have uncovered a vulnerability, please get in touch via the e-mail address security@infisical.com. In the message, try to provide a description of the issue and ideally a way of reproducing it. The security team will get back to you as soon as possible.

Note that this security address should be used only for undisclosed vulnerabilities. Please report any security problems to us before disclosing it publicly.

## Contributing

Whether it's big or small, we love contributions. Check out our guide to see how to [get started](https://infisical.com/docs/contributing/overview).

Not sure where to get started? You can:

-   [Book a free, non-pressure pairing sessions with one of our teammates](mailto:tony@infisical.com?subject=Pairing%20session&body=I'd%20like%20to%20do%20a%20pairing%20session!)!
-   Join our <a href="https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g">Slack</a>, and ask us any questions there.

## Resources

- [Docs](https://infisical.com/docs/documentation/getting-started/introduction) for comprehensive documentation and guides
- [Slack](https://join.slack.com/t/infisical-users/shared_invite/zt-1kdbk07ro-RtoyEt_9E~fyzGo_xQYP6g) for discussion with the community and Infisical team.
- [GitHub](https://github.com/Infisical/infisical) for code, issues, and pull requests
- [Twitter](https://twitter.com/infisical) for fast news
- [YouTube](https://www.youtube.com/@infisical5306) for videos on secret management
- [Blog](https://infisical.com/blog) for secret management insights, articles, tutorials, and updates
- [Roadmap](https://www.notion.so/infisical/be2d2585a6694e40889b03aef96ea36b?v=5b19a8127d1a4060b54769567a8785fa) for planned features

## Acknowledgements

[//]: contributor-faces

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<a href="https://github.com/dangtony98"><img src="https://avatars.githubusercontent.com/u/25857006?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/maidul98"><img src="https://avatars.githubusercontent.com/u/9300960?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/akhilmhdh"><img src="https://avatars.githubusercontent.com/u/31166322?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/reginaldbondoc"><img src="https://avatars.githubusercontent.com/u/7693108?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/mv-turtle"><img src="https://avatars.githubusercontent.com/u/78047717?s=96&v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/gangjun06"><img src="https://avatars.githubusercontent.com/u/50910815?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/asheliahut"><img src="https://avatars.githubusercontent.com/u/945619?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/SH5H"><img src="https://avatars.githubusercontent.com/u/25437192?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/gmgale"><img src="https://avatars.githubusercontent.com/u/62303146?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/asharonbaltazar"><img src="https://avatars.githubusercontent.com/u/58940073?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/JoaoVictor6"><img src="https://avatars.githubusercontent.com/u/68869379?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/mocherfaoui"><img src="https://avatars.githubusercontent.com/u/37941426?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/cerrussell"><img src="https://avatars.githubusercontent.com/u/80227828?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jon4hz"><img src="https://avatars.githubusercontent.com/u/26183582?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/edgarrmondragon"><img src="https://avatars.githubusercontent.com/u/16805946?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/arjunyel"><img src="https://avatars.githubusercontent.com/u/11153289?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/LemmyMwaura"><img src="https://avatars.githubusercontent.com/u/20738858?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Zamion101"><img src="https://avatars.githubusercontent.com/u/8071263?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Grraahaam"><img src="https://avatars.githubusercontent.com/u/72856427?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Neeraj138"><img src="https://avatars.githubusercontent.com/u/58552561?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/esau-morais"><img src="https://avatars.githubusercontent.com/u/55207584?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/animeshdas2000"><img src="https://avatars.githubusercontent.com/u/40542456?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/umrak11"><img src="https://avatars.githubusercontent.com/u/20104948?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/KunalSin9h"><img src="https://avatars.githubusercontent.com/u/82411321?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/ImBIOS"><img src="https://avatars.githubusercontent.com/u/41441643?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/sanyamjain04"><img src="https://avatars.githubusercontent.com/u/107163858?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Gabriellopes232"><img src="https://avatars.githubusercontent.com/u/74881862?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/naorpeled"><img src="https://avatars.githubusercontent.com/u/6171622?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Aashish-Upadhyay-101"><img src="https://avatars.githubusercontent.com/u/81024263?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jonerrr"><img src="https://avatars.githubusercontent.com/u/73760377?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kmlgkcy"><img src="https://avatars.githubusercontent.com/u/102428035?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/samsbg"><img src="https://avatars.githubusercontent.com/u/70488844?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/imakecodes"><img src="https://avatars.githubusercontent.com/u/35536648?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/bngmnn"><img src="https://avatars.githubusercontent.com/u/88746983?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kimcore"><img src="https://avatars.githubusercontent.com/u/36142378?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/caioluis"><img src="https://avatars.githubusercontent.com/u/30005368?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/alisson-acioli"><img src="https://avatars.githubusercontent.com/u/12742051?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/adrianmarinwork"><img src="https://avatars.githubusercontent.com/u/118568289?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/arthurzenika"><img src="https://avatars.githubusercontent.com/u/445200?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/franky47"><img src="https://avatars.githubusercontent.com/u/1174092?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/hanywang2"><img src="https://avatars.githubusercontent.com/u/44352119?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/tobias-mintlify"><img src="https://avatars.githubusercontent.com/u/110702161?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/wjhurley"><img src="https://avatars.githubusercontent.com/u/15939055?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/alexdanilowicz"><img src="https://avatars.githubusercontent.com/u/29822597?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/0xflotus"><img src="https://avatars.githubusercontent.com/u/26602940?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/wanjohiryan"><img src="https://avatars.githubusercontent.com/u/71614375?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/nirga"><img src="https://avatars.githubusercontent.com/u/4224692?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/RashidUjang"><img src="https://avatars.githubusercontent.com/u/11313829?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kanhaiya38"><img src="https://avatars.githubusercontent.com/u/54778773?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/HasanMansoor4"><img src="https://avatars.githubusercontent.com/u/68682354?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jerriclynsjohn"><img src="https://avatars.githubusercontent.com/u/3236669?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/eltociear"><img src="https://avatars.githubusercontent.com/u/22633385?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/MatthewJohn"><img src="https://avatars.githubusercontent.com/u/1266262?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/sheensantoscapadngan"><img src="https://avatars.githubusercontent.com/u/65645666?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/yoobato"><img src="https://avatars.githubusercontent.com/u/1592319?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/xinity"><img src="https://avatars.githubusercontent.com/u/1799009?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/simonemargio"><img src="https://avatars.githubusercontent.com/u/22590804?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Aqib-Rime"><img src="https://avatars.githubusercontent.com/u/116422706?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/ha-sante"><img src="https://avatars.githubusercontent.com/u/90225652?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/5h4k4r"><img src="https://avatars.githubusercontent.com/u/56171149?v=4" width="50" height="50" alt=""/></a>

