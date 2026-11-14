# P0-4 (keepmind): escopo `mcp:read` separado de escrita no MCP Corp

**Origem:** `BRIEF-P0-THOR.md` / `MELHORIAS-KEEPMIND.md` (14/11/2026). Esforço: M. Base: `main` @ 5aade2b.

## Problema
O escopo `mcp:invoke` libera o catálogo inteiro, escrita incluída (`sb_append`, tools CRM de escrita). O sidecar do KeepMind OS precisa de um token que **só leia**.

## Onde (main atual)
- `corp/mcp-api.mjs:11-12`: `GET /api/mcp/tools` devolve `MCP_TOOLS` inteiro.
- `corp/mcp-api.mjs:17-18`: `POST /api/mcp/call` exige `mcp:invoke`.
- `corp/mcp-runtime.mjs:11-17`: catálogo `MCP_TOOLS` (`sb_search`, `sb_read`, `sb_append`, `sb_list`, `...crmTools`).
- `corp/server.mjs:986-987`: o gate de escopo por rota também exige `mcp:invoke`. Precisa aceitar `mcp:read`.
- `corp/mcp-stdio-worker.mjs:29-30`: o worker stdio também exige `mcp:invoke`.
- `corp/api-tokens.mjs:22`: os escopos padrão dos tokens.

## O que fazer
- Marcar cada tool do catálogo como `access: 'read' | 'write'`. As CRM também: classificar cada uma pelo efeito. Na dúvida, `write`.
- Um token com `mcp:read` só lista e chama tools `read`. Chamar tool `write` ⇒ **403**.
- `mcp:invoke` continua compatível: os tokens existentes seguem com leitura e escrita, sem quebrar integrações. Documentar no PR e no README por que se escolheu compatibilidade, e não revogação.
- `GET /tools` filtra pelo escopo do token.
- Aplicar a mesma regra no `server.mjs` e no `mcp-stdio-worker.mjs`.
- Documentar no README a receita do sidecar do KeepMind OS: token só com `mcp:read`, sem escrita e sem GitHub.

## Critérios de aceite (do brief)
- [ ] Testes 403 para escrita com `mcp:read`.
- [ ] Testes de leitura OK com `mcp:read`.
- [ ] `GET /tools` filtrado pelo escopo.
- [ ] `mcp:invoke` compatível (teste de regressão).
- [ ] README com a receita do sidecar do KeepMind OS.

## Testes esperados
- Token `mcp:read`:
  - `GET /api/mcp/tools` lista só tools `read`;
  - `POST /api/mcp/call` com `sb_search`/`sb_read`/`sb_list` ⇒ 200;
  - com `sb_append` ou uma CRM de escrita ⇒ 403, e o arquivo não é alterado.
- Token `mcp:invoke`: comportamento atual mantido (lista completa, escrita permitida).
- Token sem nenhum dos dois ⇒ 403.
- Worker stdio com `mcp:read`: as mesmas regras.
- Teste que garante que toda tool de `MCP_TOOLS` tem `access` definido, para que uma tool nova não fique sem classificação.

## Regras (obrigatórias)
- **Sem plaintext:** nenhuma credencial, passphrase, chave ou conteúdo de nota em texto puro em disco, log, teste ou PR.
- **Sem dados de vault no git:** só fixtures sintéticas geradas no teste; nada de vault real, segredo ou token.
- **Não mexer em `.github/workflows`.**
- Trabalhar nesta branch / PR **draft**. Nada de push na main, merge, release ou tag sem o OK do Gustavo. Sem force-push.
- TDD: o teste novo falha no main atual e passa com a correção. Rodar `npm test`, `npm run typecheck` (e lint, se houver) e registrar no PR quais falhas já existiam no main.
- `git diff --check` limpo; rodar gitleaks no diff se disponível.
- Este arquivo de spec pode ser mantido ou removido no commit da implementação.
