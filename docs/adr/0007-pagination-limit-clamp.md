# 7. Pagination `limit` clamps instead of rejecting

## Context

`GET /releases` (and the paginated endpoints that share its shape) takes a `limit` query
parameter with a natural ceiling — the API shouldn't let a single request pull an unbounded
number of rows. A client can still send `limit=0`, a negative number, or something far above any
reasonable ceiling (`limit=99999`). We need to decide how out-of-range values are handled.

## Options considered

1. **Reject out-of-range `limit` with `400 VALIDATION_ERROR`.** The strictest reading of input
   validation, but it punishes a client that's simply trying to ask for "everything" and guessed
   too high — they get the same ceiling either way, just after an extra round-trip to fix their
   request.
2. **Clamp silently to `[1, 100]`.** The client always gets a response; a `limit` outside the
   range is corrected rather than rejected, and the effective value is reported back in
   `pagination.limit` so it's never actually hidden from the client, just not treated as an error.
3. **Clamp the upper bound only, reject `limit <= 0`.** A middle ground — the "give me more"
   case is forgiving, but a nonsensical zero-or-negative request still fails loudly.

## Decision

Go with option 2: `limit` clamps to `[1, 100]` in both directions, silently. This is a read-only,
low-stakes listing endpoint, not a mutating request where a silently "corrected" input could mask
a real client bug — and the response's own `pagination.limit` field always tells the caller what
was actually used, so the correction is visible, just not fatal. A non-numeric `limit` (e.g.
`limit=abc`) is a different failure mode — that's still a genuine `400 VALIDATION_ERROR`, since
that's a type violation, not a range violation. `page` does not get the same treatment
(`page=0`/`page=-1` still reject) — `limit` alone was asked to clamp; `page` clamping would hide
a client requesting a page that doesn't exist behind a silently-redirected first page, which is a
worse UX than a clear 400.

## Tradeoffs

- Gains: an over-eager client (`limit=500`) always gets a response instead of a round-trip-wasting
  rejection; the effective limit is self-documenting via the response body.
- Costs: a client that assumed "no cap" and never checks `pagination.limit` gets silently fewer
  rows than requested with no error signal — mitigated by the field being present in every
  response, but only if the client actually reads it.
