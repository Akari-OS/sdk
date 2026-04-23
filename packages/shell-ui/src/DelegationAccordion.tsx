/**
 * DelegationAccordion — サブエージェント委譲の折りたたみ表示。
 *
 * Partner がサブエージェント（Analyst / Researcher 等）に委譲した際、
 * その経過と結果を折りたたみ形式で表示する。
 *
 * spec: AKARI-HUB-011 §2.4
 */

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { Delegation } from "@akari-os/sdk/partner"

const AGENT_LABELS: Record<string, { icon: string; label: string }> = {
  analyst: { icon: "\u{1F4CA}", label: "Analyst" },
  researcher: { icon: "\u{1F50D}", label: "Researcher" },
  guardian: { icon: "\u{1F6E1}", label: "Guardian" },
  memory: { icon: "\u{1F9E0}", label: "Memory" },
  operator: { icon: "\u{1F4E8}", label: "Operator" },
}

function getAgentLabel(agent: string) {
  return AGENT_LABELS[agent] ?? { icon: "\u{1F916}", label: agent }
}

interface DelegationAccordionProps {
  delegations: Delegation[]
}

export function DelegationAccordion({ delegations }: DelegationAccordionProps) {
  return (
    <div className="flex flex-col gap-1 mb-2">
      {delegations.map((d, i) => (
        <DelegationItem key={`${d.agent}-${i}`} delegation={d} />
      ))}
    </div>
  )
}

function DelegationItem({ delegation }: { delegation: Delegation }) {
  const [open, setOpen] = useState(false)
  const { icon, label } = getAgentLabel(delegation.agent)

  return (
    <div className="rounded border border-border/50 bg-muted/30 text-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground hover:text-foreground transition text-left"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0" />
        )}
        <span>
          {icon} {label} の分析結果
        </span>
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1">
          <div className="text-muted-foreground">
            <span className="font-semibold">Q:</span> {delegation.query}
          </div>
          <div className="whitespace-pre-wrap leading-relaxed">
            {delegation.result}
          </div>
        </div>
      )}
    </div>
  )
}
