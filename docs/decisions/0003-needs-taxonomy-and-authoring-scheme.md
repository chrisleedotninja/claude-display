# 0003 — Needs taxonomy and authoring scheme

Status: Accepted (2026-05-10)

## Wire enum — seven values

The `needs` field on the wire payload is one of exactly seven lowercase, hyphenated string values:

- `approve-tool`
- `answer-question`
- `provide-input`
- `pick-option`
- `confirm-destructive`
- `resolve-conflict`
- `review-diff`

These strings are the only legal values. Sibling chores [034] (server-side allow-list) and [035] (tokens module) consume these exact strings; any consumer that receives a value outside this set must reject it.
