# P0-3 (keepmind): log de auditoria do Corp sem conteúdo (só hash)

**Origem:** `BRIEF-P0-THOR.md` / `MELHORIAS-KEEPMIND.md` (14/11/2026). Esforço: S. Base: `main` @ 5aade2b.

## Problema
`invokeCorpMcpTool` grava em `ops/mcp-invocations.jsonl` até 500 caracteres do retorno de qualquer tool não-CRM. Assim, trechos das notas da memória corporativa vazam para fora do vault, no log.

## Onde (main atual)
- `corp/mcp-runtime.mjs:41`: `detail = crm_ ? '[CRM result omitted]' : out.slice(0, 500)`.
- `corp/mcp-runtime.mjs:19-23`: `auditMcp` (append JSONL).
- `corp/mcp-runtime.mjs:45`: no erro, `detail = e.message`. Avaliar se a mensagem pode carregar conteúdo; se puder, registrar só a classe ou código do erro e o hash.

## O que fazer
- `detail` passa a guardar só `{ tool, bytes, sha256 }` para **qualquer** tool, CRM incluído. O sha256 é do retorno serializado.
- Nenhum trecho do retorno ou dos args vai para o log.

## Critérios de aceite (do brief)
- [ ] Teste garante que nenhum trecho do retorno vai para o log.
- [ ] Smoke CRM verde (`npm run test:crm-browser`, ou o smoke CRM equivalente).
- [ ] `npm test` e `npm run typecheck` verdes.

## Testes esperados
- Chamar `sb_read` em um vault sintético com uma nota contendo um marcador único (ex.: `CANARY-<random>`) ⇒ a linha do JSONL não contém o marcador nem substring dele, e contém `bytes` e `sha256` corretos (recalculados no teste).
- O mesmo para `sb_search` e uma tool `crm_*`.
- Caminho de erro: a mensagem de erro com conteúdo não aparece crua no log.

## Regras (obrigatórias)
- **Sem plaintext:** nenhuma credencial, passphrase, chave ou conteúdo de nota em texto puro em disco, log, teste ou PR.
- **Sem dados de vault no git:** só fixtures sintéticas geradas no teste; nada de vault real, segredo ou token.
- **Não mexer em `.github/workflows`.**
- Trabalhar nesta branch / PR **draft**. Nada de push na main, merge, release ou tag sem o OK do Gustavo. Sem force-push.
- TDD: o teste novo falha no main atual e passa com a correção. Rodar `npm test`, `npm run typecheck` (e lint, se houver) e registrar no PR quais falhas já existiam no main.
- `git diff --check` limpo; rodar gitleaks no diff se disponível.
- Este arquivo de spec pode ser mantido ou removido no commit da implementação.
