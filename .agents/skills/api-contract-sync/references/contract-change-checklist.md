# Contract Change Checklist

Use this checklist when an API contract change touches more than one layer or repository.

## Change Types

### Usually additive

- adding an optional field
- adding a new endpoint
- adding a new optional query param
- adding a new enum value only when every consumer is already resilient to unknown values

Even additive changes still require fixture, mock, and generated-type updates where relevant.

### Potentially breaking

- removing a field
- renaming a field
- changing a field type
- changing nullability or requiredness
- changing enum semantics
- changing route paths or query param names
- changing pagination, filtering, sorting, or auth expectations

Treat these as explicit compatibility decisions.

## Consumer Checklist

- backend implementation updated
- source-of-truth contract updated
- generated types or SDK regenerated
- web frontend updated
- mobile app updated
- tests updated
- mocks or fake servers updated
- fixtures updated
- docs or examples updated if they are user-facing or operationally important

## Verification Checklist

- typecheck passes in changed repos
- build or verify passes where appropriate
- integration or route tests prove the live response shape
- behavior tests still pass in consumers
- no stale consumer-side handwritten type overrides remain

## Drift Warnings

Pause if any of these appear:

- generated files changed unexpectedly far beyond the intended contract edit
- frontend or mobile starts casting around the contract instead of updating usage properly
- fixtures pass but runtime responses no longer match them
- the change seems additive in TypeScript but changes real user-visible behavior
