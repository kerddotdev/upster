export async function assertLocalAdmin(
  message = "This action can only be performed from a local session."
) {
  const { isAdminPassphraseAllowedForCurrentRequest } =
    await import("@/features/auth/auth.server")

  if (!isAdminPassphraseAllowedForCurrentRequest()) {
    throw new Error(message)
  }
}
