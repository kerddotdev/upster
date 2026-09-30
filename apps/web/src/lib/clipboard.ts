export async function writeClipboard(value: string) {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // fall through to the selection based copy
    }
  }

  const field = document.createElement("textarea")
  field.value = value
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.opacity = "0"
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand("copy")
  field.remove()
  if (!copied) {
    throw new Error("Copy failed")
  }
}
