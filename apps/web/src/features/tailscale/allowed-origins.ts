let allowedOrigins: ReadonlyArray<string> = []

export function setAllowedOrigins(origins: Array<string>) {
  allowedOrigins = origins
}

export function isDerivedAllowedOrigin(value: string) {
  return allowedOrigins.includes(value)
}
