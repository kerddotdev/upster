export type ApiMeta = {
  generatedAt: string
  requestId: string
}

export type ApiSuccess<T> = {
  ok: true
  data: T
  meta: ApiMeta
}

export type ApiFailure = {
  ok: false
  error: {
    code: string
    message: string
    reason: string
    cause: string
    remediation: string
    humanActionRequired: boolean
    requiredScopes?: Array<string>
    currentScopes?: Array<string>
    docsCommand?: string
    details?: unknown
  }
  meta: ApiMeta
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure

export function createMeta(requestId: string): ApiMeta {
  return {
    generatedAt: new Date().toISOString(),
    requestId,
  }
}

export function createSuccess<T>(data: T, requestId: string): ApiSuccess<T> {
  return {
    ok: true,
    data,
    meta: createMeta(requestId),
  }
}

export function createFailure(
  error: ApiFailure["error"],
  requestId: string
): ApiFailure {
  return {
    ok: false,
    error,
    meta: createMeta(requestId),
  }
}
