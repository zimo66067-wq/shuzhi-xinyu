# Vercel + Neon PostgreSQL migration: acceptance runbook

**Status:** isolated Git branch only; not released for formal trials.
**Intended use:** 40 supervised manual sessions; existing SQLite deployment remains unchanged.
**Guardrail:** PG_TEST_DATABASE_URL is only for disposable CI data. Never point it to the formal study DB.

## Provision Neon (owner authorization required)
1. Connect Neon to ChatGPT or through the Vercel marketplace with the owner's explicit approval.
2. Choose the Neon free tier and review its quota, availability and backup/retention policy before provisioning.
3. Create a separate database just for this project, close to the Vercel region when available.
4. Keep connection strings, passwords and API keys only in server-side secrets. Never commit them, paste into chat, or use VITE_ prefixes.
5. Prefer Neon pooled connections with TLS for Vercel Functions.

## Isolated Vercel test deployment
Target project: shuzhi-xinyu-experiment-vercel-test.
Branch: feat/neon-experiment-postgres. Do not merge into main before acceptance.

| Environment variable | Pilot value |
| --- | --- |
| EXPERIMENT_ENABLED | 1 |
| EXPERIMENT_ENV | automated for synthetic QA; pilot for a supervised dry run |
| EXPERIMENT_DATABASE_URL | secret Neon PostgreSQL pooled connection string |
| EXPERIMENT_HUMAN_VERIFICATION | supervised |
| DEEPSEEK_MODEL | deepseek-flash |
| EXPERIMENT_SOFTWARE_COMMIT | exact 40-character commit hash of the frozen code |
| DEEPSEEK_API_KEY | leave absent for synthetic QA; secret for authorized live pilot |

Don't set EXPERIMENT_ENV=formal before the prerequisites below pass. Vercel local SQLite, including /tmp, is unsuitable as the formal evidence store.

## Administrator initialization
From a trusted terminal with the secret Postgres DSN already set in the environment, execute:

    python -m experiment.cli bootstrap --username captain

The CLI asks interactively for an administrator password with at least 12 characters. Do not pass the password on the command line. This creates an administrator audit event, not a research trial. Run python -m experiment.cli verify to check the audit chain.

For PostgreSQL, SQLite backup and PRAGMA integrity_check are inapplicable. Use provider-supported backup/restore or pg_dump and restore into a separate empty verification database.

## Acceptance checklist: every box requires real evidence
- [ ] Vercel Flask route /api/health returns expected JSON after deployment authentication.
- [ ] /api/experiment/config responds when experiment mode enabled, and is unavailable when disabled.
- [ ] Administrator login works and non-admin access to audit data is rejected.
- [ ] Pilot batch creates exactly 40 *planned* sessions, not 40 invented API calls.
- [ ] PostgreSQL nonce replay, sequential turn numbers, hash-chain and immutable evidence checks pass.
- [ ] Records survive separate process starts; database transaction audit is consistent.
- [ ] A clearly marked pilot DeepSeek call returns actual model ID, provider response ID, tokens, HTTP status and latency; synthetic responses never qualify.
- [ ] Local interceptions and upstream failures are distinct from successful DeepSeek responses.
- [ ] Audit export contains sufficient source records and no plaintext credentials.
- [ ] Backup is restored into another database and verified with counts and chain-head hash.
- [ ] Captain explicitly authorizes formal experiment only after the above acceptance.

## Formal gate
Formal Postgres batches require EXPERIMENT_ENV=formal, an actual PostgreSQL connection, a frozen Git commit, a real configured DeepSeek secret, and both EXPERIMENT_PG_BACKUP_ACK=verified and EXPERIMENT_PG_BACKUP_REF.
Only set backup flags after actual restore verification; flags do not prove backups or human execution.

## Evidence boundary
CI uses disposable PostgreSQL 16 and synthetic model replies. It does not test Neon uptime, real DeepSeek API use, or human participation. Those require their own pilot evidence and must remain separate from the 40-session formal dataset.
