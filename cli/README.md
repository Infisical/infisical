## Install
#### Windows 
Use [Scoop](https://scoop.sh/) package manager

```
$ scoop bucket add org https://github.com/Infisical/scoop-infisical.git
$ scoop install infisical
$ infisical --version
```

To update:

```
$ scoop update infisical
```

#### Mac OS 
Use [brew](https://brew.sh/) package manager

```
$ brew install infisical/get-cli/infisical  
$ infisical --version
```

To update:

```
$ brew upgrade infisical
```

#### Linux
##### Debian/Ubuntu (package manager: apt) 

```
Add Infisical apt repo 
$ echo "deb [trusted=yes] https://apt.fury.io/infisical/ /" | tee -a /etc/apt/sources.list.d/infisical.list

Add prerequisites
$ apt update && apt -y install ca-certificates sudo 

Install infisical cli
$ sudo apt update && apt install infisical

To make sure the CLI has been installed, you may run this command.
$ infisical --version 
```

We do not yet have repositores setup for APK, YUM and APT package managers. However, we have several binaries which can be downloaded manually for your Linux. Please vist the [release age](https://github.com/Infisical/infisical/releases) 

#### Install via bash and curl
This script will attempt to download the correct version of Infisical CLI and add it to your path. No package manager needed.

```
curl https://raw.githubusercontent.com/Infisical/infisical/main/scripts/install.sh | sh
```

## Local Usage
Once you have the CLI installed, using it is easy. 

#### Steps 1
Create a project at https://infisical.com/ if you haven't already add your secrets to it. 

#### Step 2
Login to the CLI by running the following command in your terminal 

```
infisical login 
```

#### Step 3
After logging in, `CD` to the root of the project where you would like to inject your secrets into. Once you are in the root, run the following command in the terminal to link your Infisical project to your local project.

```
infisical init 
```

#### Step 3
To inject the secrets from the project you have selected into your application process, run the following command.

```
infisical run -- <your application start command>
```

Example:

```
infisical run -- npm run dev 
```

## General production Usage
Once you have the binary installed in your production environment, injecting secrets is easy. 

#### Steps 1
Get a Infisical Token for your project by visiting BLANK. Also note down the project ID for which you created the token for. 

#### Steps 2
Ensure your application has the environment variable `INFISICAL_TOKEN` asigned to the token you received in step one. Then run 

```
infisical run --projectId=<projectID> -- <your application start command>
```

