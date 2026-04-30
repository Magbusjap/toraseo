# Model compatibility notes

This document tracks manually verified AI model behavior for the native
`API + AI Chat` mode.

ToraSEO can connect to many OpenRouter models, but not every model is
equally useful for structured SEO audit output. A model may answer normal
chat prompts while still failing the stricter audit-report contract.

## Compatibility levels

- **Structured audit** - the model returned a parseable ToraSEO audit
  report and can update `Overview`, `Confirmed facts`, and follow-up chat.
- **Plain response only** - the model answered, but did not confirm the
  structured audit contract. It may still be useful for setup questions or
  light guidance.
- **Provider error / timeout** - the model failed through OpenRouter or was
  too slow for the current runtime path.

## Verified on 2026-04-30

| Model | OpenRouter ID | Status | Notes |
| --- | --- | --- | --- |
| OpenAI: GPT-5.4 Mini | `openai/gpt-5.4-mini` | Structured audit | Fast response in live testing. Good candidate for the default paid model. |
| Inception: Mercury 2 | `inception/mercury-2` | Structured audit | Cheap model that returned a structured audit result in live testing. |
| Qwen: Qwen3.6 Flash | `qwen/qwen3.6-flash` | Plain response / unreliable structured audit | The model connects and spends tokens, but was slow and did not reliably return the audit schema. |
| NVIDIA: Nemotron 3 Nano Omni (free) | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | Plain response only | Multimodal/perception-oriented model. It answered, but did not confirm structured audit output. |
| Anthropic: Claude Haiku 4.5 | `anthropic/claude-haiku-4.5` | Provider error in current test | OpenRouter returned a generic provider error during strict structured-output testing. |

## Testing policy

Compatibility testing should stay gradual. Each paid-model check may spend
provider tokens, so do not attempt to test the entire OpenRouter catalog at
once.

Recommended process:

1. Add one candidate model profile in Settings.
2. Run the per-model Settings check.
3. Record whether the result is structured audit, plain response only, or
   provider error / timeout.
4. Run a small real site scan only for models that pass the structured check.
5. Compare quality by factual grounding, useful prioritization, Russian
   locale quality, latency, and token cost.

Future app versions can turn this file into an in-app compatibility list, but
the first source of truth should remain real project testing.
