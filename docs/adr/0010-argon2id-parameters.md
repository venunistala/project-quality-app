# 10. Password hashing: argon2id parameters

## Context

Phase 3's spec allows "argon2id (or bcrypt with a documented cost factor)". Both are legitimate,
purpose-built password-hashing functions (unlike SHA-256, used for session tokens in ADR 0009,
which is deliberately fast and is *not* appropriate here — a password is a low-entropy,
user-chosen secret that must resist offline brute force). A concrete choice and concrete
parameters need to be picked and written down, since "argon2id" alone isn't a complete decision —
the cost parameters determine the actual security margin.

## Options considered

1. **bcrypt, cost factor 12.** Battle-tested, available everywhere, no native-addon install risk
   in most environments. Not memory-hard — a GPU/ASIC farm can brute-force bcrypt hashes far more
   cheaply per-guess than a memory-hard function, because bcrypt's cost only scales CPU time, not
   memory bandwidth.
2. **argon2id, OWASP's current minimum-recommended parameters** (`memoryCost: 19456` i.e. ~19 MiB,
   `timeCost: 2`, `parallelism: 1`). Winner of the 2015 Password Hashing Competition, memory-hard
   by design (expensive to parallelize on GPU/ASIC hardware), and the option CLAUDE.md/the Phase 3
   spec list first. Ships as a native Node addon (the `argon2` npm package), which is a small
   install-risk compared to bcrypt's more universally-prebuilt tooling — mitigated here by
   confirming prebuilt binaries exist for this project's target platforms (win32-x64 included)
   before committing to it.

## Decision

Go with option 2: argon2id via the `argon2` npm package, with
`{ type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }` — OWASP's current
minimum-recommended argon2id profile. Centralized in `apps/api/src/security/password.ts`
(`hashPassword`/`verifyPassword`) so the parameters are defined in exactly one place, used both by
login verification and by the seed script's dev-password hashing.

## Tradeoffs

- Gains: memory-hardness gives meaningfully better offline brute-force resistance than bcrypt at
  a comparable per-hash cost; matches current OWASP guidance rather than a legacy default; a single
  parameter tuple in one file means raising the cost later (as hardware gets cheaper) is a one-line
  change.
- Costs: `argon2` is a native addon, not pure JS — install requires a working native build step or
  a prebuilt binary for the target platform/arch (available here); bcrypt would have been the
  zero-native-dependency choice if install friction becomes a real problem in some future
  environment, which is why it's documented as the fallback rather than dismissed outright.
