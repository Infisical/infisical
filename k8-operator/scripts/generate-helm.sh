#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
HELM_DIR="${PROJECT_ROOT}/../helm-charts/secrets-operator"
LOCALBIN="${PROJECT_ROOT}/bin"
KUSTOMIZE="${LOCALBIN}/kustomize"
HELMIFY="${LOCALBIN}/helmify"

# Debug prints
echo "SCRIPT_DIR: ${SCRIPT_DIR}"
echo "PROJECT_ROOT: ${PROJECT_ROOT}"
echo "KUSTOMIZE: ${KUSTOMIZE}"
echo "HELMIFY: ${HELMIFY}"

cd "${PROJECT_ROOT}"

# First run the regular helm target to generate base templates
"${KUSTOMIZE}" build config/default | "${HELMIFY}" "${HELM_DIR}"



# ? NOTE: Processes all files that end with crd.yaml (so only actual CRDs)
for crd_file in "${HELM_DIR}"/templates/*crd.yaml; do
  # Skip if file doesn't exist (pattern doesn't match)
  [ -e "$crd_file" ] || continue
  
  echo "Processing CRD file: ${crd_file}"
  
  # Create backup of the generated file
  cp "$crd_file" "$crd_file.bkp"
  
  # Get CRD kind for potential conditional logic
  CRD_KIND=$(grep -E "kind: [a-zA-Z]+" "$crd_file" | head -n1 | awk '{print $2}')
  echo "Found CRD kind: ${CRD_KIND}"
  
  # Create a new file with the if statement, then append the entire original content
  echo "{{- if .Values.installCRDs }}" > "$crd_file.new"
  cat "$crd_file.bkp" >> "$crd_file.new"
  
  # Make sure the file ends with a newline before adding the end tag
  # Check if file already ends with a newline
  if [ "$(tail -c1 "$crd_file.new" | wc -l)" -eq 0 ]; then
    # File doesn't end with a newline, add one
    echo "" >> "$crd_file.new"
  fi
  
  # Add the end tag on a new line
  echo "{{- end }}" >> "$crd_file.new"
  
  # Replace the original file with the new one
  mv "$crd_file.new" "$crd_file"
  
  # Clean up backup
  rm "$crd_file.bkp"
  
  echo "Completed processing for: ${crd_file}"
done

# ? NOTE: Processes only the manager-rbac.yaml file
# Process the manager-rbac.yaml file specially
# Process the manager-rbac.yaml file specially
# Process the manager-rbac.yaml file specially
# Process the manager-rbac.yaml file specially
if [ -f "${HELM_DIR}/templates/manager-rbac.yaml" ]; then
  echo "Processing manager-rbac.yaml file specifically"
  
  # Make a copy of the original file for reference
  cp "${HELM_DIR}/templates/manager-rbac.yaml" "${HELM_DIR}/templates/manager-rbac.yaml.bkp"
  
  # Extract the rules section from the original file
  rules_section=$(sed -n '/^rules:/,/^---/p' "${HELM_DIR}/templates/manager-rbac.yaml.bkp" | sed '$d')
  
  # Extract the original label lines (assuming they're after the second labels: line)
  original_labels=$(sed -n '/^  labels:/,/^roleRef:/p' "${HELM_DIR}/templates/manager-rbac.yaml.bkp" | grep "app.kubernetes.io")
  
  # Create a new file from scratch with exactly what we want
  {
    # First section - Role/ClusterRole
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
    
    # Add the rules section
    echo "$rules_section"
    
    # Second section - RoleBinding/ClusterRoleBinding
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
    
    # Add the roleRef section with custom logic
    echo "roleRef:"
    echo "  apiGroup: rbac.authorization.k8s.io"
    echo "  {{- if and .Values.scopedNamespace .Values.scopedRBAC }}"
    echo "  kind: Role"
    echo "  {{- else }}"
    echo "  kind: ClusterRole"
    echo "  {{- end }}"
    echo "  name: '{{ include \"secrets-operator.fullname\" . }}-manager-role'"
    
    # Add the subjects section
    sed -n '/^subjects:/,$ p' "${HELM_DIR}/templates/manager-rbac.yaml.bkp"
  } > "${HELM_DIR}/templates/manager-rbac.yaml.new"
  
  # Replace the original file with the new one
  mv "${HELM_DIR}/templates/manager-rbac.yaml.new" "${HELM_DIR}/templates/manager-rbac.yaml"
  rm "${HELM_DIR}/templates/manager-rbac.yaml.bkp"
  
  echo "Completed processing for manager-rbac.yaml with both role conditions and metadata applied"
fi

echo "Helm chart generation complete with custom templating applied."