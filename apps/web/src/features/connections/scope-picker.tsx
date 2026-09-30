import { InfoIcon } from "lucide-react"
import {
  connectionScopePresets,
  type AccessScope,
  type ConnectionScopePreset,
} from "@upster/core"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  describeScopes,
  presetMeta,
  scopeGroups,
} from "@/features/connections/scope-presets"
import { cn } from "@/lib/utils"

export type ScopePreset = ConnectionScopePreset | "custom"

const optionClassName =
  "flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-border transition-colors hover:bg-muted/50 has-data-checked:bg-muted/60"

function ScopeList({ scopes }: { scopes: ReadonlyArray<string> }) {
  return (
    <div className="flex flex-col gap-0.5">
      {scopes.map((scope) => (
        <span key={scope} className="font-mono text-xs">
          {scope}
        </span>
      ))}
    </div>
  )
}

export function ScopeBadge({ scopes }: { scopes: Array<string> }) {
  const list = scopes as Array<AccessScope>

  return (
    <Tooltip>
      <TooltipTrigger render={<Badge variant="outline" className="shrink-0" />}>
        {describeScopes(list)}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <ScopeList scopes={list} />
      </TooltipContent>
    </Tooltip>
  )
}

export function ScopePicker({
  preset,
  customScopes,
  canGrant,
  onPresetChange,
  onToggleScope,
}: {
  preset: ScopePreset
  customScopes: Array<AccessScope>
  canGrant: (scope: AccessScope) => boolean
  onPresetChange: (next: ScopePreset) => void
  onToggleScope: (scope: AccessScope) => void
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Permissions</span>
        <RadioGroup
          value={preset}
          onValueChange={(value) => onPresetChange(value as ScopePreset)}
        >
          {(["viewer", "operator", "fullAdmin"] as const).map((name) => (
            <label key={name} className={optionClassName}>
              <RadioGroupItem value={name} className="mt-0.5" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {presetMeta[name].label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {presetMeta[name].description}
                </span>
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="inline-flex shrink-0 self-center text-muted-foreground hover:text-foreground" />
                  }
                >
                  <InfoIcon className="size-4" />
                  <span className="sr-only">
                    Show {presetMeta[name].label} scopes
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <ScopeList scopes={connectionScopePresets[name]} />
                </TooltipContent>
              </Tooltip>
            </label>
          ))}
          <label className={optionClassName}>
            <RadioGroupItem value="custom" className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Custom</span>
              <span className="text-xs text-muted-foreground">
                Pick exactly which permissions to grant.
              </span>
            </span>
          </label>
        </RadioGroup>
      </div>

      {preset === "custom" ? (
        <div className="grid grid-cols-1 gap-4 rounded-xl bg-muted/50 p-3 sm:grid-cols-2">
          {scopeGroups.map((group) => (
            <div key={group.domain} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {group.label}
              </span>
              {group.scopes.map((scope) => {
                const disabled = !canGrant(scope)
                return (
                  <label
                    key={scope}
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    )}
                  >
                    <Checkbox
                      checked={customScopes.includes(scope)}
                      disabled={disabled}
                      onCheckedChange={() => onToggleScope(scope)}
                    />
                    <span className="font-mono">{scope}</span>
                  </label>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
