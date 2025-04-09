#!/usr/bin/env bash
#
# The core commands execute start from the "MAIN" section below.
#

test -z "$BASH_SOURCE" && {
    self="sudo -E bash"
    prefix="<curl command> |"
} || {
    self=$(readlink -f ${BASH_SOURCE:-$0})
    prefix=""
}

tmp_log=$(mktemp .s3_setup_XXXXXXXXX)

# Environment variables that can be set
PKG_URL=${PKG_URL:-"https://artifacts-cli.infisical.com"}
PKG_PATH=${PKG_PATH:-"deb"}
PACKAGE_NAME=${PACKAGE_NAME:-"infisical"}
GPG_KEY_URL=${GPG_KEY_URL:-"${PKG_URL}/infisical.gpg"}

colours=$(tput colors 2>/dev/null || echo "256")
no_colour="\e[39;49m"
green_colour="\e[32m"
red_colour="\e[41;97m"
bold="\e[1m"
reset="\e[0m"
use_colours=$(test -n "$colours" && test $colours -ge 8 && echo "yes")
test "$use_colours" == "yes" || {
  no_colour=""
  green_colour=""
  red_colour=""
  bold=""
  reset=""
}

example_name="Ubuntu/Focal (20.04)"
example_distro="ubuntu"
example_codename="focal"
example_version="20.04"

function echo_helptext {
    local help_text="$*"
    echo " ^^^^: ... $help_text"
}

function die {
    local text="$@"
    test ! -z "$text" && {
      echo_helptext "$text" 1>&2
    }

    local prefix="${red_colour} !!!!${no_colour}"

    echo -e "$prefix: Oh no, your setup failed! :-( ... But we might be able to help. :-)"
    echo -e "$prefix: "
    echo -e "$prefix: ${bold}Please check your S3 bucket configuration and try again.${reset}"
    echo -e "$prefix: "
    
    test -f "$tmp_log" && {
      local n=20
      echo -e "$prefix: Last $n log lines from $tmp_log (might not be errors, nor even relevant):"
      echo -e "$prefix:"
      check_tool_silent "xargs" && {
        check_tool_silent "fmt" && {
          tail -n $n $tmp_log | fmt -t | xargs -Ilog echo -e "$prefix: > log"
        } || {
          tail -n $n $tmp_log | xargs -Ilog echo -e "$prefix: > log"
        }
      } || {
        echo
        tail -n $n $tmp_log
      }
    }
    exit 1
}

function echo_colour {
    local colour="${1:-"no"}_colour"; shift
    echo -e "${!colour}$@${no_colour}"
}

function echo_green_or_red {
    local rc="$1"
    local good="${2:-YES}"
    local bad="${3:-NO}"

    test "$rc" -eq 0 && {
        echo_colour "green" "$good"
    } || {
        echo_colour "red" "$bad"
    }
    return $rc
}

function echo_clearline {
    local rc="$?"
    echo -e -n "\033[1K\r"
    return $rc
}

function echo_status {
    local rc="$1"
    local good="$2"
    local bad="$3"
    local text="$4"
    local help_text="$5"
    local newline=$(test "$6" != "no" && echo "\n" || echo "")
    local status_text=$(echo_green_or_red "$rc" "$good" "$bad")

    echo_clearline
    local width=$(test "$use_colours" == "yes" && echo "16" || echo "5")
    printf "%${width}s %s${newline}" "${status_text}:" "$text"
    test $rc -ne 0 && test ! -z "$help_text" && {
        echo_helptext "$help_text"
        echo
    }

    return $rc
}

function echo_running {
    local rc=$?
    local text="$1"
    echo_status 0 "  RUN" " RUN" "$text" "" "no"
    return $rc
}

function echo_okfail_rc {
    local rc=$1
    local text="$2"
    local help_text="$3"
    echo_clearline
    echo_status $rc "   OK" " NOPE" "$text" "$help_text"
    return $rc
}

function echo_okfail {
    echo_okfail_rc $? "$@"
    return $?
}

function check_tool_silent {
    local tool=${1}
    command -v $tool &>/dev/null || which $tool &>/dev/null
    return $?
}

function check_tool {
    local tool=${1}
    local optional=${2:-false}
    local required_text="optional"
    if ! $optional; then required_text="required"; fi
    local text="Checking for $required_text executable '$tool' ..."
    echo_running "$text"
    check_tool_silent "$tool"
    echo_okfail "$text" || {
        if ! $optional; then
            die "$tool is not installed, but is required by this script."
        fi
        return 1
    }
    return 0
}

function cleanup {
    echo
    rm -rf $tmp_log
}

function shutdown {
    echo_colour "red" " !!!!: Operation cancelled by user!"
    exit 2
}

function check_os {
    test ! -z "$distro" && test ! -z "${version}${codename}"
    return $?
}

function detect_os_system {
    check_os && return 0
    echo_running "$text"
    local text="Detecting your OS distribution and release using system methods ..."

    local tool_rc=1
    test -f '/etc/os-release' && {
      . /etc/os-release
      distro=${distro:-$ID}
      codename=${codename:-$VERSION_CODENAME}
      codename=${codename:-$(echo $VERSION | cut -d '(' -f 2 | cut -d ')' -f 1)}
      version=${version:-$VERSION_ID}

      test -z "${version}${codename}" && test -f '/etc/debian_version' && {
        # Workaround for Debian unstable releases; get the codename from debian_version
        codename=$(cat /etc/debian_version | cut -d '/' -f1)
      }

      tool_rc=0
    }

    check_os
    local rc=$?
    echo_okfail_rc $rc "$text"

    test $tool_rc -eq 0 && {
      report_os_expanded
    }

    return $rc
}

function report_os_attribute {
  local name=$1
  local value=$2
  local coloured=""
  echo -n "$name="
  test -z "$value" && {
    echo -e -n "${red_colour}<empty>${no_colour}  "
  } || {
    echo -e -n "${green_colour}${value}${no_colour}  "
  }
}

function report_os_expanded {
  echo_helptext "Detected/provided for your OS/distribution, version and architecture:"
  echo " >>>>:"
  report_os_values
}

function report_os_values {
  echo -n " >>>>: ... "
  report_os_attribute "distro" $distro
  report_os_attribute "codename" "stable (fixed)"
  report_os_attribute "arch" $arch
  echo
  echo " >>>>:"
}

function detect_os_legacy_python {
    check_os && return 0

    local text="Detecting your OS distribution and release using legacy python ..."
    echo_running "$text"

    IFS='' read -r -d '' script <<-'EOF'
from __future__ import unicode_literals, print_function
import platform;
info = platform.linux_distribution() or ('', '', '');
for key, value in zip(('distro', 'version', 'codename'), info):
    print("local guess_%s=\"%s\"\n" % (key, value.lower().replace(' ', '')));
EOF

    local tool_rc=1
    check_tool_silent "python" && {
      eval $(python -c "$script")
      distro=${distro:-$guess_distro}
      codename=${codename:-$guess_codename}
      version=${version:-$guess_version}
      tool_rc=$?
    }

    check_os
    local rc=$?
    echo_okfail_rc $rc "$text"

    check_tool_silent "python" || {
      echo_helptext "Python isn't available, so skipping detection method (hint: install python)"
    }

    test $tool_rc -eq 0 && {
      report_os
    }

    return $rc
}

function detect_os_modern_python {
    check_os && return 0

    check_tool_silent "python" && {
      local text="Ensuring python-pip is installed ..."
      echo_running "$text"
      check_tool_silent "pip"
      echo_okfail "$text" || {
          local text="Checking if pip can be bootstrapped without get-pip ..."
          echo_running "$text"
          python -m ensurepip --default-pip &>$tmp_log
          echo_okfail "$text" || {
              local text="Installing pip via get-pip bootstrap ..."
              echo_running "$text"
              curl -1sLf https://bootstrap.pypa.io/get-pip.py 2>$tmp/log | python &>$tmp_log
              echo_okfail "$text" || die "Failed to install pip!"
          }
      }

      local text="Installing 'distro' python library ..."
      echo_running "$text"
      python -c 'import distro' &>$tmp_log || python -m pip install distro &>$tmp_log
      echo_okfail "$text" || die "Failed to install required 'distro' python library!"
    }

    IFS='' read -r -d '' script <<-'EOF'
from __future__ import unicode_literals, print_function
import distro;
info = distro.linux_distribution(full_distribution_name=False) or ('', '', '');
for key, value in zip(('distro', 'version', 'codename'), info):
    print("local guess_%s=\"%s\"\n" % (key, value.lower().replace(' ', '')));
EOF

    local text="Detecting your OS distribution and release using modern python ..."
    echo_running "$text"

    local tool_rc=1
    check_tool_silent "python" && {
      eval $(python -c "$script")
      distro=${distro:-$guess_distro}
      codename=${codename:-$guess_codename}
      version=${version:-$guess_version}
      tool_rc=$?
    }

    check_os
    local rc=$?
    echo_okfail_rc $rc "$text"

    check_tool_silent "python" || {
      echo_helptext "Python isn't available, so skipping detection method (hint: install python)"
    }

    test $tool_rc -eq 0 && {
      report_os_expanded
    }

    return $rc
}

function detect_os {
    # Backwards compat for old distribution parameter names
    distro=${distro:-$os}
    
    # Always use "stable" as the codename
    codename="stable"

    arch=${arch:-$(arch || uname -m)}

    # Only detect OS if not manually specified
    if [ -z "$distro" ]; then
        detect_os_system ||
          detect_os_legacy_python ||
          detect_os_modern_python
    fi

    # Always ensure we have a distro
    (test -z "$distro") && {
      echo_okfail_rc "1" "Unable to detect your OS distribution!"
      cat <<EOF
 >>>>:
 >>>>: The 'distro' value is required. Without it, the install script
 >>>>: cannot retrieve the correct configuration for this system.
 >>>>:
 >>>>: You can force this script to use a particular value by specifying distro
 >>>>: via environment variable. E.g., to specify a distro
 >>>>: such as $example_name, use the following:
 >>>>:
 >>>>: $prefix distro=$example_distro $self
 >>>>:
EOF
      die
    }
}

function create_repo_config {
    if [ -z "$PKG_PATH" ]; then
        repo_url="${PKG_URL}"
    else
        repo_url="${PKG_URL}/${PKG_PATH}"
    fi
    
    # Create configuration with GPG key verification
    local gpg_keyring_path="/usr/share/keyrings/${PACKAGE_NAME}-archive-keyring.gpg"
    local apt_conf=$(cat <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=${gpg_keyring_path}] ${repo_url} stable main
EOF
)
    echo "$apt_conf"
    return 0
}

function check_gpg_key {
    local text="Checking if GPG key is accessible at ${GPG_KEY_URL} ..."
    echo_running "$text"
    local code="$(curl -1IsL -w "%{http_code}\\n" "$GPG_KEY_URL" -o /dev/null --connect-timeout 15 --max-time 60)"
    test "$code" == "200" && {
      echo_okfail_rc 0 "$text"
      return 0
    } || {
        echo_okfail_rc 1 "$text"
        echo_helptext "Failed to access the GPG key. Please check that it exists in your S3 bucket."
        cat <<EOF
 >>>>:
 >>>>: It looks like we can't access the GPG key at ${GPG_KEY_URL}
 >>>>:
EOF
        die
    }
}

function check_dpkg_tool {
    local tool=${1}
    local required=${2:-true}
    local install=${3:-true}

    local text="Checking for apt dependency '$tool' ..."
    echo_running "$text"
    dpkg -l | grep "$tool\>" &>$tmp_log
    echo_okfail "$text" || {
        if $install; then
            test "$apt_updated" == "yes" || update_apt
            local text="Attempting to install '$tool' ..."
            echo_running "$text"
            apt-get install -y "$tool" &>$tmp_log
            echo_okfail "$text" || {
                if $required; then
                  die "Could not install '$tool', check your permissions, etc."
                fi
            }
        else {
            if $required; then
                die "$tool is not installed, but is required by this script."
            fi
        }
        fi
    }
    return 0
}

function update_apt {
    local text="Updating apt repository metadata cache ..."
    local tmp_log=$(mktemp .s3_deb_output_XXXXXXXXX.log)
    echo_running "$text"
    apt-get update &>$tmp_log
    echo_okfail "$text" || {
        echo_colour "red" "Failed to update via apt-get update"
        cat $tmp_log
        rm -rf $tmp_log
        die "Failed to update via apt-get update - Context above (maybe no packages?)."
    }
    rm -rf $tmp_log
    apt_updated="yes"
}

function install_apt_prereqs {
    # Debian-archive-keyring has to be installed for apt-transport-https.
    test "${distro}" == "debian" && {
        check_dpkg_tool "debian-keyring"
        check_dpkg_tool "debian-archive-keyring"
    }

    check_dpkg_tool "apt-transport-https"
    check_dpkg_tool "ca-certificates" false
    check_dpkg_tool "gnupg"
}

function import_gpg_key {
    local text="Importing '$PACKAGE_NAME' repository GPG key from S3 ..."
    echo_running "$text"

    local gpg_keyring_path="/usr/share/keyrings/${PACKAGE_NAME}-archive-keyring.gpg"
    
    # Check if GPG key is accessible
    check_gpg_key
    
    # Download and import GPG key
    curl -1sLf "${GPG_KEY_URL}" | gpg --dearmor > $gpg_keyring_path
    chmod 644 $gpg_keyring_path
    
    # Check for older apt versions that don't support signed-by
    local signed_by_version="1.1"
    local detected_version=$(dpkg -s apt | grep Version | cut -d' ' -f2)

    if [ "$(printf "%s\n" $detected_version $signed_by_version | sort -V | head -n 1)" != "$signed_by_version" ]; then
        echo_helptext "Detected older apt version without signed-by support. Copying key to trusted.gpg.d."
        cp ${gpg_keyring_path} /etc/apt/trusted.gpg.d/${PACKAGE_NAME}.gpg
        chmod 644 /etc/apt/trusted.gpg.d/${PACKAGE_NAME}.gpg
    fi

    echo_okfail "$text" || die "Could not import the GPG key for this repository"
}

function setup_repository {
    local repo_path="/etc/apt/sources.list.d/${PACKAGE_NAME}.list"

    local text="Installing '$PACKAGE_NAME' repository via apt ..."
    echo_running "$text"
    create_repo_config > "$repo_path"
    chmod 644 $repo_path
    echo_okfail "$text" || die "Could not install the repository, do you have permissions?"
}

function usage () {
     cat <<EOF
Usage: $self [opts]
  -h Displays this usage text.
  -i Ignore repository setup errors during setup and
     continue with install.  This will leave the repository config
     in place rather than removing it upon errors.
  -p Package name to use for repository setup (default: ${PACKAGE_NAME})
  -k GPG key URL (default: ${GPG_KEY_URL})
EOF
     exit 0
}

trap cleanup EXIT
trap shutdown INT

ignore_errors=1
apt_updated="no"

while getopts ":ihp:b:s:k:" OPT; do
    case $OPT in
         i) ignore_errors=0 ;;
         h) usage ;;
         p) PACKAGE_NAME=$OPTARG ;;
         b) PKG_URL=$OPTARG ;;
         s) PKG_PATH=$OPTARG ;;
         k) GPG_KEY_URL=$OPTARG ;;
        \?) usage ;;
    esac
done
shift $(($OPTIND - 1))

#
# MAIN
#

echo "Executing the setup script for the '$PACKAGE_NAME' S3 repository ..."
echo

check_tool "curl"
check_tool "apt-get"

detect_os
install_apt_prereqs
import_gpg_key
setup_repository
update_apt

echo_okfail_rc "0" "The repository has been installed successfully - You're ready to rock!"
echo
echo "You can now install the package with: apt install $PACKAGE_NAME"
