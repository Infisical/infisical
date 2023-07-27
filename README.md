<h1 align="center">
  <img width="300" src="/img/logoname-black.svg#gh-light-mode-only" alt="infisical">
  <img width="300" src="/img/logoname-white.svg#gh-dark-mode-only" alt="infisical">
</h1>
<p align="center">
  <p align="center"><b>Open-source, end-to-end encrypted secret management platform</b>: distribute secrets/configs across your team/infrastructure and prevent secret leaks.</p>
</p>

<h4 align="center">
  <a href="https://infisical.com/slack">Slack</a> |
  <a href="https://infisical.com/">Infisical Cloud</a> |
  <a href="https://infisical.com/docs/self-hosting/overview">Self-Hosting</a> |
  <a href="https://infisical.com/docs/documentation/getting-started/introduction">Docs</a> |
  <a href="https://www.infisical.com">Website</a>
</h4>

<p align="center">
  <a href="https://infisical.com/docs/self-hosting/deployment-options/aws-ec2">
    <img src=".github/images/deploy-to-aws.png" width="137" />
  </a>
  <a href="https://infisical.com/docs/self-hosting/deployment-options/digital-ocean-marketplace" alt="Deploy to DigitalOcean">
     <img width="200" alt="Deploy to DO" src="https://www.deploytodo.com/do-btn-blue.svg"/>
  </a>
</p>

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
    <img src="https://img.shields.io/badge/Downloads-395.8k-orange" alt="Cloudsmith downloads" />
  </a>
  <a href="https://infisical.com/slack">
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

- **[User-friendly dashboard](https://infisical.com/docs/documentation/platform/project)** to manage secrets across projects and environments (e.g. development, production, etc.)
- **[Client SDKs](https://infisical.com/docs/sdks/overview)** to fetch secrets for your apps and infrastructure on demand
- **[Infisical CLI](https://infisical.com/docs/cli/overview)** to fetch and inject secrets into any framework in local development
- **[Native integrations](https://infisical.com/docs/integrations/overview)** with platforms like GitHub, Vercel, Netlify, and more
- [**Automatic Kubernetes deployment secret reloads**](https://infisical.com/docs/documentation/getting-started/kubernetes)
- **[Complete control over your data](https://infisical.com/docs/self-hosting/overview)** - host it yourself on any infrastructure
- **[Secret versioning](https://infisical.com/docs/documentation/platform/secret-versioning)** and **[Point-in-Time Recovery]()** to version every secret and project state
- **[Audit logs](https://infisical.com/docs/documentation/platform/audit-logs)** to record every action taken in a project
- **Role-based Access Controls** per environment
- [**Simple on-premise deployments** to AWS, Digital Ocean, and more](https://infisical.com/docs/self-hosting/overview)
- [**Secret Scanning and Leak Prevention**](https://infisical.com/docs/cli/scanning-overview)

And much more.

## Getting started

Check out the [Quickstart Guides](https://infisical.com/docs/getting-started/introduction)

| Use Infisical Cloud                                                                                                                                     | Deploy Infisical on premise                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The fastest and most reliable way to <br> get started with Infisical is signing up <br> for free to [Infisical Cloud](https://app.infisical.com/login). | <a href="https://infisical.com/docs/self-hosting/deployment-options/aws-ec2"><img src=".github/images/deploy-to-aws.png" width="150" width="300" /></a> <a href="https://infisical.com/docs/self-hosting/deployment-options/digital-ocean-marketplace" alt="Deploy to DigitalOcean"> <img width="217" alt="Deploy to DO" src="https://www.deploytodo.com/do-btn-blue.svg"/> </a> <br> View all [deployment options](https://infisical.com/docs/self-hosting/overview) |

### Run Infisical locally

To set up and run Infisical locally, make sure you have Git and Docker installed on your system. Then run the command for your system:

Linux/macOS:

```console
git clone https://github.com/Infisical/infisical && cd "$(basename $_ .git)" && cp .env.example .env && docker-compose -f docker-compose.yml up
```

Windows Command Prompt:

```console
git clone https://github.com/Infisical/infisical && cd infisical && copy .env.example .env && docker-compose -f docker-compose.yml up
```

Create an account at `http://localhost:80`

### Scan and prevent secret leaks

On top managing secrets with Infisical, you can also [scan for over 140+ secret types]() in your files, directories and git repositories.

To scan your full git history, run:

```
infisical scan --verbose
```

Install pre commit hook to scan each commit before you push to your repository

```
infisical scan install --pre-commit-hook
```

Lean about Infisical's code scanning feature [here](https://infisical.com/docs/cli/scanning-overview)

## Open-source vs. paid

This repo available under the [MIT expat license](https://github.com/Infisical/infisical/blob/main/LICENSE), with the exception of the `ee` directory which will contain premium enterprise features requiring a Infisical license.

If you are interested in managed Infisical Cloud of self-hosted Enterprise Offering, take a look at [our webiste](https://infisical.com/) or [book a meeting with us](https://cal.com/vmatsiiako/infisical-demo):

<a href="https://cal.com/vmatsiiako/infisical-demo"><img alt="Schedule a meeting" src="https://cal.com/book-with-cal-dark.svg" /></a>

## Security

Please do not file GitHub issues or post on our public forum for security vulnerabilities, as they are public!

Infisical takes security issues very seriously. If you have any concerns about Infisical or believe you have uncovered a vulnerability, please get in touch via the e-mail address security@infisical.com. In the message, try to provide a description of the issue and ideally a way of reproducing it. The security team will get back to you as soon as possible.

Note that this security address should be used only for undisclosed vulnerabilities. Please report any security problems to us before disclosing it publicly.

## Contributing

Whether it's big or small, we love contributions. Check out our guide to see how to [get started](https://infisical.com/docs/contributing/overview).

Not sure where to get started? You can:

- [Book a free, non-pressure pairing session / code walkthrough with one of our teammates](https://cal.com/tony-infisical/30-min-meeting-contributing)!
- Join our <a href="https://infisical.com/slack">Slack</a>, and ask us any questions there.

## Resources

- [Docs](https://infisical.com/docs/documentation/getting-started/introduction) for comprehensive documentation and guides
- [Slack](https://infisical.com/slack) for discussion with the community and Infisical team.
- [GitHub](https://github.com/Infisical/infisical) for code, issues, and pull requests
- [Twitter](https://twitter.com/infisical) for fast news
- [YouTube](https://www.youtube.com/@infisical_os) for videos on secret management
- [Blog](https://infisical.com/blog) for secret management insights, articles, tutorials, and updates
- [Roadmap](https://www.notion.so/infisical/be2d2585a6694e40889b03aef96ea36b?v=5b19a8127d1a4060b54769567a8785fa) for planned features

## Acknowledgements

[//]: contributor-faces

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<a href="https://github.com/dangtony98"><img src="https://avatars.githubusercontent.com/u/25857006?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/maidul98"><img src="https://avatars.githubusercontent.com/u/9300960?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/akhilmhdh"><img src="https://avatars.githubusercontent.com/u/31166322?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/reginaldbondoc"><img src="https://avatars.githubusercontent.com/u/7693108?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/mv-turtle"><img src="https://avatars.githubusercontent.com/u/78047717?s=96&v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/gangjun06"><img src="https://avatars.githubusercontent.com/u/50910815?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/asheliahut"><img src="https://avatars.githubusercontent.com/u/945619?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/SH5H"><img src="https://avatars.githubusercontent.com/u/25437192?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/gmgale"><img src="https://avatars.githubusercontent.com/u/62303146?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/asharonbaltazar"><img src="https://avatars.githubusercontent.com/u/58940073?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/JoaoVictor6"><img src="https://avatars.githubusercontent.com/u/68869379?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/mocherfaoui"><img src="https://avatars.githubusercontent.com/u/37941426?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/cerrussell"><img src="https://avatars.githubusercontent.com/u/80227828?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jon4hz"><img src="https://avatars.githubusercontent.com/u/26183582?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/edgarrmondragon"><img src="https://avatars.githubusercontent.com/u/16805946?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/arjunyel"><img src="https://avatars.githubusercontent.com/u/11153289?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/LemmyMwaura"><img src="https://avatars.githubusercontent.com/u/20738858?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Zamion101"><img src="https://avatars.githubusercontent.com/u/8071263?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Grraahaam"><img src="https://avatars.githubusercontent.com/u/72856427?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Neeraj138"><img src="https://avatars.githubusercontent.com/u/58552561?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/esau-morais"><img src="https://avatars.githubusercontent.com/u/55207584?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/animeshdas2000"><img src="https://avatars.githubusercontent.com/u/40542456?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/umrak11"><img src="https://avatars.githubusercontent.com/u/20104948?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/KunalSin9h"><img src="https://avatars.githubusercontent.com/u/82411321?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/ImBIOS"><img src="https://avatars.githubusercontent.com/u/41441643?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/sanyamjain04"><img src="https://avatars.githubusercontent.com/u/107163858?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Gabriellopes232"><img src="https://avatars.githubusercontent.com/u/74881862?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/naorpeled"><img src="https://avatars.githubusercontent.com/u/6171622?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Aashish-Upadhyay-101"><img src="https://avatars.githubusercontent.com/u/81024263?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jonerrr"><img src="https://avatars.githubusercontent.com/u/73760377?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kmlgkcy"><img src="https://avatars.githubusercontent.com/u/102428035?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/samsbg"><img src="https://avatars.githubusercontent.com/u/70488844?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/imakecodes"><img src="https://avatars.githubusercontent.com/u/35536648?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/bngmnn"><img src="https://avatars.githubusercontent.com/u/88746983?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kimcore"><img src="https://avatars.githubusercontent.com/u/36142378?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/caioluis"><img src="https://avatars.githubusercontent.com/u/30005368?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/alisson-acioli"><img src="https://avatars.githubusercontent.com/u/12742051?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/adrianmarinwork"><img src="https://avatars.githubusercontent.com/u/118568289?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/arthurzenika"><img src="https://avatars.githubusercontent.com/u/445200?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/franky47"><img src="https://avatars.githubusercontent.com/u/1174092?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/hanywang2"><img src="https://avatars.githubusercontent.com/u/44352119?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/tobias-mintlify"><img src="https://avatars.githubusercontent.com/u/110702161?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/wjhurley"><img src="https://avatars.githubusercontent.com/u/15939055?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/alexdanilowicz"><img src="https://avatars.githubusercontent.com/u/29822597?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/0xflotus"><img src="https://avatars.githubusercontent.com/u/26602940?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/wanjohiryan"><img src="https://avatars.githubusercontent.com/u/71614375?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/nirga"><img src="https://avatars.githubusercontent.com/u/4224692?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/RashidUjang"><img src="https://avatars.githubusercontent.com/u/11313829?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/kanhaiya38"><img src="https://avatars.githubusercontent.com/u/54778773?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/HasanMansoor4"><img src="https://avatars.githubusercontent.com/u/68682354?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/jerriclynsjohn"><img src="https://avatars.githubusercontent.com/u/3236669?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/eltociear"><img src="https://avatars.githubusercontent.com/u/22633385?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/MatthewJohn"><img src="https://avatars.githubusercontent.com/u/1266262?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/sheensantoscapadngan"><img src="https://avatars.githubusercontent.com/u/65645666?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/yoobato"><img src="https://avatars.githubusercontent.com/u/1592319?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/xinity"><img src="https://avatars.githubusercontent.com/u/1799009?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/simonemargio"><img src="https://avatars.githubusercontent.com/u/22590804?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/Aqib-Rime"><img src="https://avatars.githubusercontent.com/u/116422706?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/ha-sante"><img src="https://avatars.githubusercontent.com/u/90225652?v=4" width="50" height="50" alt=""/></a> <a href="https://github.com/5h4k4r"><img src="https://avatars.githubusercontent.com/u/56171149?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/quinton11"><img src="https://avatars.githubusercontent.com/u/70300837?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/afrieirham"><img src="https://avatars.githubusercontent.com/u/32460534?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/Stijn-Kuijper"><img src="https://avatars.githubusercontent.com/u/25306980?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/atimapreandrew"><img src="https://avatars.githubusercontent.com/u/60506711?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/satyamgupta1495"><img src="https://avatars.githubusercontent.com/u/51158766?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/RezaRahemtola"><img src="https://avatars.githubusercontent.com/u/49811529?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/JunedKhan101"><img src="https://avatars.githubusercontent.com/u/47941768?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/unkletayo"><img src="https://avatars.githubusercontent.com/u/48031746?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/agoodman1999"><img src="https://avatars.githubusercontent.com/u/113685729?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/Spelchure"><img src="https://avatars.githubusercontent.com/u/20704539?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/piyushchhabra"><img src="https://avatars.githubusercontent.com/u/12864227?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/PylotLight"><img src="https://avatars.githubusercontent.com/u/7006124?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/jorgeteixe"><img src="https://avatars.githubusercontent.com/u/45232371?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/chisom5"><img src="https://avatars.githubusercontent.com/u/22566806?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/zwkee"><img src="https://avatars.githubusercontent.com/u/109659187?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/raykeating"><img src="https://avatars.githubusercontent.com/u/29098307?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/khoa165"><img src="https://avatars.githubusercontent.com/u/46258781?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/pgaijin66"><img src="https://avatars.githubusercontent.com/u/8869096?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/Budhathoki356"><img src="https://avatars.githubusercontent.com/u/53488484?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/mswider"><img src="https://avatars.githubusercontent.com/u/37093293?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/parthvnp"><img src="https://avatars.githubusercontent.com/u/41171860?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/seonggwonyoon"><img src="https://avatars.githubusercontent.com/u/37574822?v=4" width="50" height="50" alt=""/></a>
<a href="https://github.com/ChukwunonsoFrank"><img src="https://avatars.githubusercontent.com/u/62689166?v=4" width="50" height="50" alt=""/></a>
