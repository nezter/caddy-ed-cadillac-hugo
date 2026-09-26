# Subagent Model Routing

Which model to use for which kind of work.

**Hard rule: `opencode-go` only. Never the `opencode` (OpenCode Zen) provider.**
Zen models are `opencode/*` — `opencode/space-bunny-free`,
`opencode/big-pickle`, `opencode/longcat-2.5-preview-free`, and so on. If a
model id starts with `opencode/` it is Zen and it is off limits for subagents.

The main session runs on whatever it runs on. **Subagents are always
`opencode-go/*`,** chosen by workload.

## Why route at all

The failure mode without routing is that every subagent gets the same model and
the same budget. That is wrong in both directions: a 600-line read-only review
does not need a frontier model, and a precise one-line endpoint fix does not
deserve one. Matching model to workload is most of the value.

Two subagent classes in this repo have actually failed when given a strong
model, and both are worth remembering:

- **Mechanical work with a tight spec** (repoint an endpoint, port CSS hex to
  tokens, wire a front-matter list) — a frontier model second-guesses the spec
  and starts redesigning. A code-tuned mid-tier model does the stated thing.
- **Mechanical work without a tight spec** — the opposite: it invents an
  architecture you did not ask for.

So: the brief must carry the spec, and the model should be chosen to *follow*
it. That is why the routing below is organised by "how much judgement does this
need", not by "how big is the file".

## CURRENT POLICY (supersedes the table below)

The `opencode-go` provider is **exhausted** -- three dispatches in a row died
with "Go usage limit exceeded" before any agent started. Until further notice:

| Workload | Model |
|---|---|
| Judgement-heavy: reviews, decisions, contract reconciliation | `zai-coding-plan/glm-5.3-flash` |
| Bulk and mechanical: sweeps, counting, gate-running, wiring from a spec | `zai-coding-plan/glm-5-turbo` |

**Free tier only.** Do not use `glm-5.3`, `glm-5.2`, `glm-5.2-highspeed`,
`glm-5.3-highspeed` (not available to this account), or `glm-4.7` -- they draw
on the paid quota. Nothing outside the `zai-coding-plan` provider, and still
never the OpenCode Zen provider.

## The routing table (superseded, kept for the reasoning)

| Workload | Model | Why |
|---|---|---|
| **Architecture / correctness review** — auditing many files for a specific class of bug, deciding what is safe to delete | `opencode-go/deepseek-v4-pro` | Needs to hold a whole subsystem in view and reason about interactions. The inventory consolidation review and the auth audit both needed this. |
| **Adversarial review / "what is wrong with this"** | `opencode-go/qwen3.8-max` | Second opinion on a plan before committing to it. Good at "you are about to delete something that is load-bearing". |
| **Implementation from a precise spec** — the spec in the brief is complete | `opencode-go/kimi-k2.7-code` | Code-specialised. Follows an explicit contract instead of reinventing one. Use for wiring endpoints, contract reconciliation, CSS token ports. |
| **Implementation with design latitude** — building something the brief describes but does not specify | `opencode-go/glm-5.3` | Good general engineering judgement, will make reasonable choices when the brief leaves room. |
| **Long-context reading / surveying a large tree** | `opencode-go/kimi-k3` | When the task is mostly "read a lot and summarise what exists". |
| **Bulk sweeps, greps, counting, gate-running, mechanical edits** | `opencode-go/qwen3.8-flash` | Flash tier. A job that is 90% tool calls and 10% judgement. `deepseek-v4.1-flash` is the other candidate but **it is not usable here** — it rejects every request with "This Go model requires Global regions", and the workspace is not set to Global. Discovered by paying for a dispatch to find out. |
| **Cheap parallelism** — many independent small jobs | `opencode-go/qwen3.8-flash` | Same tier, different family; useful when you want diversity across parallel workers. |
| **Throwaway / no-stakes** | `opencode-go/space-bunny-free` | Free. Only for work you would happily redo. |

Unlisted but reasonable: `opencode-go/qwen3.6-plus` and `opencode-go/qwen3.7-plus`
for generalist implementation; `opencode-go/grok-4.7` and `opencode-go/gpt-6-luna`
for review; `opencode-go/minimax-m3` for long documents.

Do **not** route to `github-copilot`, `openrouter` or `bailian-coding-plan`
without being asked. They are available, but the instruction was
opencode-go.

**Availability is not the same as being listed.** The catalogue in
`opencode.models` shows every model with `cost: null` and no region metadata, so
it cannot tell you that a model will refuse the request outright. When a
dispatch fails at the provider rather than in the agent, the fix is a different
model from the same provider and the same tier -- not a retry of the same one.

## Dispatch checklist

1. Pick the row that matches the judgement the job needs, not its file count.
2. Put the whole spec in the brief. A mid-tier model with a complete brief beats
   a frontier model with a vague one.
3. State the disjoint file set explicitly. Overlapping scopes are how two agents
   clobber each other, and it has happened twice in this repo.
4. For review work, require the finding to cite `file:line`, and require
   "absent" to be stated rather than inferred. A review that cannot prove its
   claim is a review you cannot act on.
5. Require the agent to run the gate and paste real output. This repo's whole
   defect class is code that compiles and never worked.

## Cost discipline

Every model id on the `opencode-go` provider reports `cost: null` in the models
tool, so there is no per-token figure to compare. Route on judgement required
rather than on price, and keep the flash tier for anything mechanical — that
is where the token count actually goes when it goes wrong.
