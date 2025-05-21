#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
HELM_DIR="${PROJECT_ROOT}/../helm-charts/secrets-operator"
LOCALBIN="${PROJECT_ROOT}/bin"
KUSTOMIZE="${LOCALBIN}/kustomize"
HELMIFY="${LOCALBIN}/helmify"


cd "${PROJECT_ROOT}"
# first run the regular helm target to generate base templates
"${KUSTOMIZE}" build config/default | "${HELMIFY}" "${HELM_DIR}"



# ? NOTE: Processes all files that end with crd.yaml (so only actual CRDs)
for crd_file in "${HELM_DIR}"/templates/*crd.yaml; do
  # skip if file doesn't exist (pattern doesn't match)
  [ -e "$crd_file" ] || continue
  
  echo "Processing CRD file: ${crd_file}"
  
  cp "$crd_file" "$crd_file.bkp"
  
  # if we ever need to run conditional logic based on the CRD kind, we can use this
  # CRD_KIND=$(grep -E "kind: [a-zA-Z]+" "$crd_file" | head -n1 | awk '{print $2}')
  # echo "Found CRD kind: ${CRD_KIND}"
  
  # create a new file with the conditional statement, then append the entire original content
  echo "{{- if .Values.installCRDs }}" > "$crd_file.new"
  cat "$crd_file.bkp" >> "$crd_file.new"
  
  # make sure the file ends with a newline before adding the end tag (otherwise it might get messed up and end up on the same line as the last line)
  # check if file already ends with a newline
  if [ "$(tail -c1 "$crd_file.new" | wc -l)" -eq 0 ]; then
    # File doesn't end with a newline, add one
    echo "" >> "$crd_file.new"
  fi
  
  # add the end tag on a new line
  echo "{{- end }}" >> "$crd_file.new"
  
  # replace the original file with the new one
  mv "$crd_file.new" "$crd_file"
  
  # clean up backup
  rm "$crd_file.bkp"
  
  echo "Completed processing for: ${crd_file}"
done

# ? NOTE: Processes only the manager-rbac.yaml file
if [ -f "${HELM_DIR}/templates/manager-rbac.yaml" ]; then
  echo "Processing manager-rbac.yaml file specifically"


  cp "${HELM_DIR}/templates/manager-rbac.yaml" "${HELM_DIR}/templates/manager-rbac.yaml.bkp"
  
  # extract the rules section from the original file
  rules_section=$(sed -n '/^rules:/,/^---/p' "${HELM_DIR}/templates/manager-rbac.yaml.bkp" | sed '$d')
  # extract the original label lines
  original_labels=$(sed -n '/^  labels:/,/^roleRef:/p' "${HELM_DIR}/templates/manager-rbac.yaml.bkp" | grep "app.kubernetes.io")
  
  # create a new file from scratch with exactly what we want
  {
    # first section: Role/ClusterRole
    echo "apiVersion: rbac.authorization.k8s.io/v1"
    echo "{{- if and .Values.scopedNamespace .Values.scopedRBAC }}"
    echo "kind: Role"
    echo "{{- else }}"
    echo "kind: ClusterRole"
    echo "{{- end }}"
    echo "metadata:"
    echo "  name: {{ include \"secrets-operator.fullname\" . }}-manager-role"
    echo "  {{- if and .Values.scopedNamespace .Values.scopedRBAC }}"
    echo "  namespace: {{ .Values.scopedNamespace | quote }}"
    echo "  {{- end }}"
    echo "  labels:"
    echo "  {{- include \"secrets-operator.labels\" . | nindent 4 }}"
    
    # add the existing rules section from helm-generated file
    echo "$rules_section"
    
    # second section: RoleBinding/ClusterRoleBinding
    echo "---"
    echo "apiVersion: rbac.authorization.k8s.io/v1"
    echo "{{- if and .Values.scopedNamespace .Values.scopedRBAC }}"
    echo "kind: RoleBinding"
    echo "{{- else }}"
    echo "kind: ClusterRoleBinding"
    echo "{{- end }}"
    echo "metadata:"
    echo "  name: {{ include \"secrets-operator.fullname\" . }}-manager-rolebinding"
    echo "  {{- if and .Values.scopedNamespace .Values.scopedRBAC }}"
    echo "  namespace: {{ .Values.scopedNamespace | quote }}"
    echo "  {{- end }}"
    echo "  labels:"
    echo "$original_labels"
    echo "  {{- include \"secrets-operator.labels\" . | nindent 4 }}"
    
    # add the roleRef section with custom logic
    echo "roleRef:"
    echo "  apiGroup: rbac.authorization.k8s.io"
    echo "  {{- if and .Values.scopedNamespace .Values.scopedRBAC }}"
    echo "  kind: Role"
    echo "  {{- else }}"
    echo "  kind: ClusterRole"
    echo "  {{- end }}"
    echo "  name: '{{ include \"secrets-operator.fullname\" . }}-manager-role'"
    
    # add the subjects section
    sed -n '/^subjects:/,$ p' "${HELM_DIR}/templates/manager-rbac.yaml.bkp"
  } > "${HELM_DIR}/templates/manager-rbac.yaml.new"
  
  mv "${HELM_DIR}/templates/manager-rbac.yaml.new" "${HELM_DIR}/templates/manager-rbac.yaml"
  rm "${HELM_DIR}/templates/manager-rbac.yaml.bkp"
  
  echo "Completed processing for manager-rbac.yaml with both role conditions and metadata applied"
fi

# ? NOTE(Daniel): Processes proxy-rbac.yaml and metrics-reader-rbac.yaml
for rbac_file in "${HELM_DIR}/templates/proxy-rbac.yaml" "${HELM_DIR}/templates/metrics-reader-rbac.yaml"; do
  if [ -f "$rbac_file" ]; then
    echo "Adding scopedNamespace condition to $(basename "$rbac_file")"
    
    {
      echo "{{- if not .Values.scopedNamespace }}"
      cat "$rbac_file"
      echo ""
      echo "{{- end }}"
    } > "$rbac_file.new"
    
    mv "$rbac_file.new" "$rbac_file"
    
    echo "Completed processing for $(basename "$rbac_file")"
  fi
done


# ? NOTE(Daniel): Processes metrics-service.yaml
if [ -f "${HELM_DIR}/templates/metrics-service.yaml" ]; then
  echo "Processing metrics-service.yaml file specifically"
  
  metrics_file="${HELM_DIR}/templates/metrics-service.yaml"
  touch "${metrics_file}.new"
  
  while IFS= read -r line; do
    if [[ "$line" == *"{{- include \"secrets-operator.selectorLabels\" . | nindent 4 }}"* ]]; then
      # keep original indentation for the selector labels line
      echo "  {{- include \"secrets-operator.selectorLabels\" . | nindent 4 }}" >> "${metrics_file}.new"
    elif [[ "$line" == *"{{- .Values.metricsService.ports | toYaml | nindent 2 }}"* ]]; then
      # fix indentation for the ports line - use less indentation here
      echo "  {{- .Values.metricsService.ports | toYaml | nindent 2 }}" >> "${metrics_file}.new"
    else
      echo "$line" >> "${metrics_file}.new"
    fi
  done < "${metrics_file}"
  
  mv "${metrics_file}.new" "${metrics_file}"
  echo "Completed processing for metrics_service.yaml"
fi



# ? NOTE(Daniel): Processes deployment.yaml
if [ -f "${HELM_DIR}/templates/deployment.yaml" ]; then
  echo "Processing deployment.yaml file"

  touch "${HELM_DIR}/templates/deployment.yaml.new"
  
  securityContext_replaced=0
  in_first_securityContext=0
  first_securityContext_found=0
  
  # process the file line by line
  while IFS= read -r line; do
    # check if this is the first securityContext line (for kube-rbac-proxy)
    if [[ "$line" =~ securityContext.*Values.controllerManager.kubeRbacProxy ]] && [ "$first_securityContext_found" -eq 0 ]; then
      echo "$line" >> "${HELM_DIR}/templates/deployment.yaml.new"
      first_securityContext_found=1
      in_first_securityContext=1
      continue
    fi
    
    # check if this is the args line after the first securityContext
    if [ "$in_first_securityContext" -eq 1 ] && [[ "$line" =~ args: ]]; then
      # Add our custom args section with conditional logic
      echo "      - args:" >> "${HELM_DIR}/templates/deployment.yaml.new"
      echo "        {{- toYaml .Values.controllerManager.manager.args | nindent 8 }}" >> "${HELM_DIR}/templates/deployment.yaml.new"
      echo "        {{- if and .Values.scopedNamespace .Values.scopedRBAC }}" >> "${HELM_DIR}/templates/deployment.yaml.new"
      echo "        - --namespace={{ .Values.scopedNamespace }}" >> "${HELM_DIR}/templates/deployment.yaml.new"
      echo "        {{- end }}" >> "${HELM_DIR}/templates/deployment.yaml.new"
      in_first_securityContext=0
      continue
    fi
    
    # check if this is the problematic pod securityContext line
    if [[ "$line" =~ securityContext.*Values.controllerManager.podSecurityContext ]] && [ "$securityContext_replaced" -eq 0 ]; then
      # Replace with our custom securityContext
      echo "      securityContext:" >> "${HELM_DIR}/templates/deployment.yaml.new"
      echo "        runAsNonRoot: true" >> "${HELM_DIR}/templates/deployment.yaml.new"
      securityContext_replaced=1
      continue
    fi
    
    # skip the line if it's just the trailing part of the replacement
    if [[ "$securityContext_replaced" -eq 1 ]] && [[ "$line" =~ ^[[:space:]]*[0-9]+[[:space:]]*\}\} ]]; then
      # this is the trailing part of the template expression, skip it
      securityContext_replaced=0
      continue
    fi
    
    # skip the simplified args line that replaced our custom one
    if [[ "$line" =~ args:.*Values.controllerManager.manager.args ]]; then
      continue
    fi
    
    echo "$line" >> "${HELM_DIR}/templates/deployment.yaml.new"
  done < "${HELM_DIR}/templates/deployment.yaml"

  echo "      nodeSelector: {{ toYaml .Values.controllerManager.nodeSelector | nindent 8 }}" >> "${HELM_DIR}/templates/deployment.yaml.new"
  echo "      tolerations: {{ toYaml .Values.controllerManager.tolerations | nindent 8 }}" >> "${HELM_DIR}/templates/deployment.yaml.new"
  
  mv "${HELM_DIR}/templates/deployment.yaml.new" "${HELM_DIR}/templates/deployment.yaml"
  echo "Completed processing for deployment.yaml"
fi

# ? NOTE(Daniel): Processes values.yaml
if [ -f "${HELM_DIR}/values.yaml" ]; then
  echo "Processing values.yaml file"
  
  # Create a temporary file
  touch "${HELM_DIR}/values.yaml.new"
  
  # Flag to track sections
  in_resources_section=0
  in_service_account=0
  
  previous_line=""
  # Process the file line by line
  while IFS= read -r line; do

    # Check if previous line includes infisical/kubernetes-operator and this line includes tag:
    if [[ "$previous_line" =~ infisical/kubernetes-operator ]] && [[ "$line" =~ ^[[:space:]]*tag: ]]; then
      # Get the indentation
      indent=$(echo "$line" | sed 's/\(^[[:space:]]*\).*/\1/')
      # Replace with our custom tag
      echo "${indent}tag: <helm-pr-will-update-this-automatically>" >> "${HELM_DIR}/values.yaml.new"
      continue
    fi


    if [[ "$line" =~ resources: ]]; then
      in_resources_section=1
    fi
    
    if [[ "$line" =~ podSecurityContext: ]]; then
      # skip this line and continue to the next line
      continue
    fi
    
    if [[ "$line" =~ runAsNonRoot: ]] && [ "$in_resources_section" -eq 1 ]; then
      # also skip this line and continue to the next line
      continue
    fi
    
    if [[ "$line" =~ ^[[:space:]]*serviceAccount: ]]; then
      # set the flag to 1 so we can continue to print the associated lines later 
      in_service_account=1
      # print the current line
      echo "$line" >> "${HELM_DIR}/values.yaml.new"
      continue
    fi
    
    # process annotations under serviceAccount (only if in_service_account is true)
    if [ "$in_service_account" -eq 1 ]; then
      # Print the current line (annotations) 
      echo "$line" >> "${HELM_DIR}/values.yaml.new"
      
      # if we've processed the annotations, add our new fields
      if [[ "$line" =~ annotations: ]]; then
        # get the base indentation level (of serviceAccount:)
        base_indent=$(echo "$line" | sed 's/\(^[[:space:]]*\).*/\1/')
        base_indent=${base_indent%??}  # Remove two spaces to get to parent level
        
        # add nodeSelector and tolerations at the same level as serviceAccount
        echo "${base_indent}nodeSelector: {}" >> "${HELM_DIR}/values.yaml.new"
        echo "${base_indent}tolerations: []" >> "${HELM_DIR}/values.yaml.new"
      fi
      
      # exit serviceAccount section when we hit the next top-level item
      if [[ "$line" =~ ^[[:space:]]{2}[a-zA-Z] ]] && ! [[ "$line" =~ annotations: ]]; then
        in_service_account=0
      fi
      
      continue
    fi
    
    # if we reach this point, we'll exit the resources section, this is the next top-level item
    if [ "$in_resources_section" -eq 1 ] && [[ "$line" =~ ^[[:space:]]{2}[a-zA-Z] ]]; then
      in_resources_section=0
    fi
    
    # output the line unchanged
    echo "$line" >> "${HELM_DIR}/values.yaml.new"
    previous_line="$line"
  done < "${HELM_DIR}/values.yaml"
  


  # hacky, just append the kubernetesClusterDomain fields at the end of the file
  if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS version
  sed -i '' '/kubernetesClusterDomain: /d' "${HELM_DIR}/values.yaml.new"
  else
  # Linux version
  sed -i '/kubernetesClusterDomain: /d' "${HELM_DIR}/values.yaml.new"
  fi

  echo "kubernetesClusterDomain: cluster.local" >> "${HELM_DIR}/values.yaml.new"
  echo "scopedNamespace: \"\"" >> "${HELM_DIR}/values.yaml.new"
  echo "scopedRBAC: false" >> "${HELM_DIR}/values.yaml.new"
  echo "installCRDs: true" >> "${HELM_DIR}/values.yaml.new"
  
  # replace the original file with the new one
  mv "${HELM_DIR}/values.yaml.new" "${HELM_DIR}/values.yaml"
  
  echo "Completed processing for values.yaml"
fi

echo "Helm chart generation complete with custom templating applied."