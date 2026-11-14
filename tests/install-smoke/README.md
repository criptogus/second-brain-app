# Published v0.2.6 install smoke

Push branch `test/v026-install-smoke-1411` to run the macOS arm64 / Windows
matrix. It downloads GitHub release installers, matches **both size and base64
SHA512** against the matching release manifest, installs them, and checks that
both GUI processes survive 35 seconds without native/module-load errors.
No app build, npm install, commit, or release publication is involved.

The installed Electron executables supply the runtime and packaged app code:

- `vault-smoke.cjs`: SQLCipher native ABI/load, encrypted DB and wrong-key denial;
  app/passphrase/recovery and sync crypto; encrypted Memory writes, real CLI
  indexing/search/lock refusal, encrypted search index; MCP initialize, tools/list,
  read_note through dedicated fd 3 unlock, and wrong-password denial.
- `corp-smoke.mjs`: packaged Corp presence and selfcheck; embedded-style server,
  health/meta, owner login, agent enablement, token mint/import, bearer MCP tools
  and search, and invalid-token denial. Standalone Corp stdio is explicitly
  skipped because its module requires in-process organization/user bindings.

Download `install-smoke-<matrix.os>` artifacts. `out/<RUNNER_OS>/summary.json`
and the Actions summary table combine phase outcomes with per-check
`{name, ok, detail}` results. Missing reports and failed checks fail the job;
subprocess and workflow timeouts bound failures. `skipped: true` is explicit.
The Windows main manifest's hyphenated installer URL is reported as
**auto-update manifest name mismatch**, even when size/hash verification passes.
This finding does not fail integrity verification. Unsigned macOS `spctl` /
`codesign` output and screenshot failures are informational.

Logs, screenshots, health/meta, tool catalogs and individual `*-result.json`
reports explain failures. Random passphrases are generated inside the scripts;
vault credentials travel only via stdin/fd 3, and the owner password via the
server's environment. Generated credentials/tokens are never intentionally
printed or saved. Both scripts scan every file under their `--out` for leaked
credentials. Vault marker scans cover the memory and state directories, while
successful search/read transcripts may legitimately contain the nonsecret marker.
Artifacts contain only disposable test data, never a real user's vault.

Local Linux examples (use a fresh output directory on every run):

```sh
ELECTRON_RUN_AS_NODE=1 /path/to/keepmind tests/install-smoke/vault-smoke.cjs \
  --resources /path/to/resources --exe /path/to/keepmind --out /tmp/vault-smoke
ELECTRON_RUN_AS_NODE=1 /path/to/keepmind-corp tests/install-smoke/corp-smoke.mjs \
  --resources /path/to/corp/resources --exe /path/to/keepmind-corp --out /tmp/corp-smoke
```

Corp requires permission to bind loopback sockets. A sandbox `listen EPERM`
means the local server tests could not run; it is a failure, never a pass.
