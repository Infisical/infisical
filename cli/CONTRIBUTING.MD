# Infisical CLI

Our CLI is written in Go. Here's where you'll find how to contribute to Infisical's CLI!

# Local setup

Setup your local Go development environment

## Installlation

1. Install [`go`](https://go.dev/doc/install).

> Note that the below installation methods may not always provide the latest version. But it's easier to get started with go that way

### brew

```sh
# install `go` using brew
brew install go
go version
```

### deb

```sh
# install `go` using apt
sudo apt update
sudo apt upgrade
sudo apt install -y golang
go version
```

### snap

```sh
# install `go` using snap
sudo snap install go --classic
go version
```

### choco (powershell)

```sh
# install `go` using choco
choco install golang
go version
```

## Getting started

1. If you're not yet familiar with Go, here's a [guide](https://go.dev/doc/tutorial/getting-started)
2. Clone/fork the repository and place yourself in the `cli/` subfolder
   1. `git clone https://github.com/Infisical/infisical && cd cli/`
3. Build the binary to see if everything works as expected
   1. `go build`
4. If you don't see any error message, then you're ready to `go` :)
5. To test the local CLI : `go run . <sub-command> <options>`
   1. If your IDE supports it, you can also take advantage over the debugging and building functionalities
      1. [VSCode](https://code.visualstudio.com/docs/languages/go) 
      2. [JetBrains Suite](https://www.jetbrains.com/go/)

## Contributing

Once you've fixed a bug or implemented a new feature, please open a [pull request](https://infisical.com/docs/contributing/getting-started/pull-requests) and let us know about it on [Slack](https://infisical.com/slack) in the **contributing** channel! Thank you

- [Contribution guide](https://infisical.com/docs/contributing/overview)
