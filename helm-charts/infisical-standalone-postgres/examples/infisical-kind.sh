#!/usr/bin/env bash
##
## Infisical local k8s development environment setup script
## using 'kind' and 'ingress-nginx'
## https://kind.sigs.k8s.io/docs/user/ingress/
##
## DEVELOPMENT USE ONLY
## DO NOT USE IN PRODUCTION
##

## Set the color code to pimp your outputs
## echo "${bwhite}${fblack}My Text Here${reset}The rest here${fcyan}And some here${reset}"
##
function setcolors() {
  # tput background color codes
  declare -g bblack=$(tput setab 0)
  declare -g bred=$(tput setab 1)
  declare -g bgreen=$(tput setab 2)
  declare -g byellow=$(tput setab 3)
  declare -g bblue=$(tput setab 4)
  declare -g bmagenta=$(tput setab 5)
  declare -g bcyan=$(tput setab 6)
  declare -g bwhite=$(tput setab 7)
  declare -g bdefault=$(tput setab 9)

  # tput foreground color codes
  declare -g fblack=$(tput setaf 0)
  declare -g fred=$(tput setaf 1)
  declare -g fgreen=$(tput setaf 2)
  declare -g fyellow=$(tput setaf 3)
  declare -g fblue=$(tput setaf 4)
  declare -g fmagenta=$(tput setaf 5)
  declare -g fcyan=$(tput setaf 6)
  declare -g fwhite=$(tput setaf 7)
  declare -g fdefault=$(tput setaf 9)

  declare -g reset=$(tput sgr0)
}
setcolors

## Checking if the given command exist
## requires "python" "https://example.com/installation-link"
##
function requires {
  if ! [ "$(which "$1")" ]; then
    info "requirements" "$fred" && echo -e "'$1' not found, please install it to run this script ($2)"
    exit 1
  fi
}

## Automatically return 'true' or wait for user's choice depending on two switches (--fix, --prompt)
## user_prompt "Do you wish to proceed"
##
function user_prompt() {
  choice=""
  msg=${1:-"Yes or no"}
  fix=${2:-"$fix"}
  # Automatically approve
  if [[ $fix -eq 1 ]]; then
    return 0
  # Wait for approval
  elif [[ $prompt -eq 1 ]]; then
    while true; do
      choice=""
      argreader "choice" "$msg? (y/n)"
      case $choice in
      [Yy]*) return 0 ;;
      [Nn]*) return 1 ;;
      *) echo "Please answer (y)es or (n)o!" ;;
      esac
    done
  # Disapprove
  else
    return 1
  fi
}

## Read argument from user prompt and store it in a variable
## argreader "varname" "Please prompt your value" "foo"
## argreader "password" "Please prompt your password" -s
##
function argreader() {
  # Checking variable content (variable var name)
  if [ -z "${!1}" ]; then
    key=""
    # Read until value is given
    while [ -z "$key" ]; do
      if [ "$3" == '-s' ]; then
        read -s -p ">> $2 : " key && echo
      else
        read -p ">> $2 : " key && echo
      fi
      # Apply default value if given + blank
      if [ -z "$key" ] && [ ! -z "$3" ]; then key=$3; fi
    done
    # Assigning inputed value
    export ${1}="$key"
  fi
}

## Prefix the output with a given text/category/name with color (to group outputs)
##
function info() {
  echo -n "> ${2}[$1]${reset} "
}

## Terminate and cleanup the script on CTRL+C (SIGINT) signal
##
function cleanup() {
  info "script" "$fred" && echo "${bred}${fwhite} Script aborted! ${reset}"
  # Add your cleanup tasks below
  exit 0
}
trap cleanup INT

## Clear the terminal screen and output a custom ascii banner
## Generate yours here : https://ascii.co.uk/text
##
showbanner() {
  clear -x
  cat <<'EOF'
-- ∞ Infisical k8s local setup --

██╗███╗   ██╗███████╗██╗███████╗██╗ ██████╗ █████╗ ██╗       
██║████╗  ██║██╔════╝██║██╔════╝██║██╔════╝██╔══██╗██║       
██║██╔██╗ ██║█████╗  ██║███████╗██║██║     ███████║██║       
██║██║╚██╗██║██╔══╝  ██║╚════██║██║██║     ██╔══██║██║       
██║██║ ╚████║██║     ██║███████║██║╚██████╗██║  ██║███████╗  
╚═╝╚═╝  ╚═══╝╚═╝     ╚═╝╚══════╝╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝  
EOF
  echo "${reset}"
}

showbanner

# defines requirements
requires "helm" "https://helm.sh/docs/intro/install/"
requires "kubectl" "https://kubernetes.io/docs/tasks/tools/"
requires "kind" "https://kubernetes.io/docs/tasks/tools/"
requires "cat"

showbanner

# define variables
namespace="infisical-dev"
cluster_name="infisical"
host="infisical.local"
fix=0
prompt=1

# create the local cluster (expose 80/443 on localhost)
cat <<EOF | kind create cluster -n $cluster_name --wait 1m -q --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
EOF

# switch to the local infisical k8s context
kubectl config use-context "kind-$cluster_name" >/dev/null

# install ingress-nginx
# kind version : https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
if ! kubectl get pods -n ingress-nginx | grep "ingress-nginx-controller" >/dev/null; then
  helm upgrade -i --atomic \
    --repo https://kubernetes.github.io/ingress-nginx \
    ingress-nginx ingress-nginx \
    -n ingress-nginx --create-namespace \
    --set controller.service.type="NodePort" \
    --set controller.hostPort.enabled=true \
    --set controller.service.externalTrafficPolicy=Local

  # wait for the ingress controller to be ready
  kubectl wait -n ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s
fi

if user_prompt "Do you want to install/update Infisical on the current k8s cluster (${fcyan}$(kubectl config current-context)${reset})"; then

  # configure the required variables
  # further configuration variables can be found here : https://infisical.com/docs/self-hosting/configuration/envars
  cat <<EOF >.env.local
  # auto-generated values
  ENCRYPTION_KEY=$(tr -dc '[:alnum:]' </dev/urandom | dd bs=4 count=8 2>/dev/null | tr '[:upper:]' '[:lower:]')
  AUTH_SECRET=$(tr -dc '[:alnum:]' </dev/urandom | dd bs=4 count=8 2>/dev/null | tr '[:upper:]' '[:lower:]' | base64)
EOF

  # create the Infisical namespace
  if ! kubectl get ns $namespace >/dev/null 2>&1; then
    kubectl create ns $namespace >/dev/null
  fi

  # create the required Infisical configuration secret
  if ! kubectl get secrets -n $namespace "infisical-secrets" >/dev/null 2>&1; then
    read -p ">> Please check the values generated in '${fcyan}.env.local${reset}', and press ${fcyan}[ENTER]${reset}" && echo
    kubectl create secret generic infisical-secrets --from-env-file=.env.local -n $namespace >/dev/null
  else
    info "config" "${fred}" && echo -e "The secret '${fcyan}infisical-secrets${reset}' already exists in the '${fcyan}$namespace${reset}' namespace!"
    if user_prompt "Do you want to overwrite current config"; then
      read -p ">> Please check the values generated in '${fcyan}.env.local${reset}', and press ${fcyan}[ENTER]${reset}" && echo
      kubectl delete secret infisical-secrets -n $namespace >/dev/null
      kubectl create secret generic infisical-secrets --from-env-file=.env.local -n $namespace >/dev/null
    else
      info "config" "$fcyan" && echo "Current config kept!"
    fi
  fi

  info "helm" "$fcyan" && echo "Installing..."

  # fetch the required charts
  cd ../ && helm dep update >/dev/null

  # install infisical
  helm upgrade --install --atomic \
    -n $namespace --create-namespace \
    --set SITE_URL=http://infisical.local \
    --set infisical.config.SMTP_HOST="infisical-dev-mailhog" \
    --set infisical.config.SMTP_USERNAME="dev@infisical.local" \
    --set infisical.config.SMTP_PASSWORD="" \
    --set infisical.config.SMTP_PORT="1025" \
    --set infisical.config.SMTP_SECURE="false" \
    --set infisical.config.SMTP_FROM_ADDRESS="dev@infisical.local" \
    --set infisical.config.SMTP_FROM_NAME="Local Infisical" \
    --set ingress.hostname="infisical.local" \
    --set ingress.nginx.enabled="false" \
    infisical-dev .

  # install mailhog (local mail server/client)
  helm upgrade --install --atomic \
    -n $namespace --create-namespace \
    --set ingress.enabled="true" \
    --set ingress.ingressClassName="nginx" \
    --set ingress.hosts[0].host="mailhog.infisical.local" \
    --set ingress.hosts[0].paths[0].path="/" \
    --set ingress.hosts[0].paths[0].pathType="Prefix" \
    --repo https://codecentric.github.io/helm-charts \
    --version "5.2.3" \
    infisical-dev-mailhog mailhog
else
  cleanup
fi
