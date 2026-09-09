{{- define "infisical-gateway-kms.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "infisical-gateway-kms.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "infisical-gateway-kms.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "infisical-gateway-kms.labels" -}}
app.kubernetes.io/name: {{ include "infisical-gateway-kms.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end }}

{{- define "infisical-gateway-kms.gatewayLabels" -}}
{{ include "infisical-gateway-kms.labels" . }}
app.kubernetes.io/component: gateway
{{- end }}

{{- define "infisical-gateway-kms.kmsLabels" -}}
{{ include "infisical-gateway-kms.labels" . }}
app.kubernetes.io/component: kms
{{- end }}
