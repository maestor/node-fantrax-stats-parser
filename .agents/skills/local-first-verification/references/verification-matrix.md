# Verification Matrix

Use this matrix to choose the first meaningful local check.

## Change Type To First Check

### Pure logic or utility code

- start with focused unit tests
- add typecheck if signatures or generics changed

### UI behavior inside one screen or component

- start with behavior tests
- escalate to browser or device checks only if layout, focus, routing, or visual state matters

### Styling only

- start with browser or device verification
- add visual or behavior tests only when styles affect interaction states

### Route, navigation, or deep-link behavior

- start with route-level behavior or integration tests
- escalate to E2E if the full shell or browser history matters

### Backend route, cache, DB, or auth behavior

- start with integration tests through the real boundary
- add unit tests only for extracted pure logic

### API contract or generated client changes

- start with contract regeneration or validation plus integration verification
- then verify at least one affected consumer path

### Build, config, or environment changes

- start with the narrowest command that proves the config works
- escalate to the standard project gate if the config affects the full app

## Escalation Signals

Escalate when:

- the changed behavior is not visible to the current test layer
- mocks or fixtures may have drifted from runtime
- multiple layers changed together
- accessibility or visual behavior is part of the outcome
- the repo requires a full gate before completion

## Reporting Pattern

Keep the final summary short:

- what was verified
- at what layer
- what was not verified and why
