# Creative agents and music generation stack

Status: agent collaboration and private Phase 03 music generation are implemented. Audio-provider selection is updated by [decision 0005](decisions/0005-elevenlabs-final-songs.md). This document supports the [studio implementation plan](../plan-v2/MASTER_PLAN.md).

## Recommendation

Use **NEAR AI Cloud** for each creative agent's reasoning and structured proposals. The TypeScript worker coordinates their durable creative workflow. Keep external side effects, permissions, revenue accounting, and payouts in validated application code and the NEAR contract. **ElevenLabs Music v2.5** now supplies final sung songs. Stability AI Stable Audio 3 remains an optional instrumental adapter.

The worker persists attributable agent proposals and model output and coordinates a two-agent collaboration. The private Phase 03 album contains two live generated, owner-approved sung songs. LangGraph remains a proposed dependency, not an installed component.

## First agent team

| Agent | Deliverable | Decision boundary |
| --- | --- | --- |
| Producer | Brief, roles, deadlines, album concept, final creative review | Cannot approve another agent's split or bypass policy. |
| Lyricist | Lyrics and revisions, with attribution to its agent identity | Cannot imitate named artists or submit unlicensed source lyrics. |
| Composer/arranger | Structured composition plan, style, sections, instrumentation | Generates instructions for the audio tool; its text is not a finished recording. |
| Audio reviewer | Checks playable output, duration, content, and fit to brief; requests bounded revisions | Cannot claim a recording was mastered unless a mastering tool actually processed it. |
| Publishing/finance agent | Proposes metadata and split, requests release, later triggers authorized settlement | NEAR contract and admin policy validate publication and payments. |

Start with at least two distinct agent identities; one agent may perform multiple roles. Store each contribution, model/tool run, revision, and acceptance under the correct identity. The coordinator schedules work but never impersonates another agent. Every revenue share needs an explicit, versioned acceptance from each participant or a documented dispute path.

## Workflow

`brief -> parallel lyric/composition tasks -> shared review -> audio composition plan -> audio generation -> technical and creative review -> bounded revision loop -> split negotiation -> policy gate -> publish -> listener purchase/tip -> contract allocation and payout`

The human-review setting pauses before protected split, publication, or payment actions. Autonomous mode proceeds only if the current versioned policy authorizes the specific agent, work, amount, and action. A durable graph checkpoint resumes creative state after restart. Each external call (especially paid audio generation, publication, and payout) has a separate stable idempotency key and recorded outcome because a resumed graph node can run again. An unknown payment result stays pending until reconciled.

## Audio adapters and rights gate

The selected [ElevenLabs Music composition plan API](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans) receives exact agent lyric lines and structured style instructions. The worker reserves a paid-call budget before submission, stores the completed MP3 by hash and never automatically repeats an uncertain paid request. Save provider/model, plan hash, request ID when returned, media hash, duration, cost when known, and license basis with each version. Keep API credentials server-side.

The [Stability AI text-to-audio API](https://docs.stability.ai/api-reference/stable-audio/text-to-audio) remains implemented for optional instrumental drafts. Stable Audio 3 does not produce intelligible sung lyrics, as [Stability's prompt guide](https://stability.ai/guides/stable-audio-3-prompt-guide) states. The two final songs use ElevenLabs directly and need no separate mix.

The owner attests written ElevenLabs permission, but the agreement reference has not been supplied. Public publishing is blocked by the repository until a separate provider permission reference is recorded for each ElevenLabs asset. The songs and album are private accepted assets.

## Sources

- [LangGraph.js workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)
- [LangGraph.js persistence and interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [Stability AI text-to-audio API](https://docs.stability.ai/api-reference/stable-audio/text-to-audio)
- [Stable Audio 3 prompt guide](https://stability.ai/guides/stable-audio-3-prompt-guide)
- [Stability AI commercial licensing guide](https://kb.stability.ai/knowledge-base/stable-audio-commerical-and-usage-licensing)
- [ElevenLabs Music terms](https://elevenlabs.io/music-terms)
- [ElevenLabs Music composition plans](https://elevenlabs.io/docs/eleven-api/guides/how-to/music/composition-plans)
- [NEAR AI Cloud specialized endpoints](https://docs.near.ai/cloud/guides/specialized-endpoints)
