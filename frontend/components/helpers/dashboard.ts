/**
 * This function copies the project id to the clipboard
 */
const copyToClipboard = (copyTextRef: any) => {
  copyTextRef.current.select()
  copyTextRef.current.setSelectionRange(0, 99999) // For mobile devices
  navigator.clipboard.writeText(copyTextRef.current.value)
}

// This function downloads the secrets as a .env file
const downloadAsEnv = (data: any, envMapping: any, env: any) => {
  const file = data
    .map((item: any) => [item.key, item.value].join("="))
    .join("\n")
  const blob = new Blob([file])
  const fileDownloadUrl = URL.createObjectURL(blob)
  const alink = document.createElement("a")

  alink.href = fileDownloadUrl
  alink.download = envMapping[env] + ".env"
  alink.click()
}

export { copyToClipboard, downloadAsEnv }
