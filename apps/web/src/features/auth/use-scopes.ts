import { useRouterState } from "@tanstack/react-router"
import { scopesIncludeAll, type AccessScope } from "@upster/core"

type RootLoaderData = {
  scopes?: Array<AccessScope> | null
}

export function useScopes(): Array<AccessScope> | null {
  return useRouterState({
    select: (state) => {
      const root = state.matches.find((match) => match.routeId === "__root__")
      return (root?.loaderData as RootLoaderData | undefined)?.scopes ?? null
    },
  })
}

export function useHasScopes(...scopes: Array<AccessScope>): boolean {
  const current = useScopes()
  if (current === null) {
    return false
  }

  return scopesIncludeAll(current, scopes)
}
