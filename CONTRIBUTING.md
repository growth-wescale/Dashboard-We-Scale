# Contribuindo com o Dashboard We Scale

Leia [`SECURITY.md`](SECURITY.md) antes de começar. As regras de segurança valem pra todo mundo.

## Fluxo de trabalho

Todo trabalho passa por PR. **Ninguém commita direto na `main`** — a branch é protegida.

```bash
git checkout main
git pull                                    # sempre puxe antes de começar
git checkout -b feat/nome-descritivo-curto  # ou fix/, docs/, refactor/, perf/
# ... suas mudanças ...
git commit -m "feat(area): descrição"
git push -u origin feat/nome-descritivo-curto
# abrir PR no GitHub
```

## Convenções de branch

| Prefixo | Quando usar |
|---|---|
| `feat/` | Nova funcionalidade |
| `fix/` | Correção de bug |
| `docs/` | Só documentação |
| `refactor/` | Reescrita sem mudança de comportamento |
| `perf/` | Melhoria de performance |
| `chore/` | Manutenção (deps, config) |

Exemplos bons: `feat/tab-instagram-social`, `fix/timezone-mtd-virada-dia`, `perf/memoizar-computebrand`

## Convenções de commit

Segue [Conventional Commits](https://www.conventionalcommits.org/) simplificado:

```
tipo(escopo): descrição curta em pt-BR

Corpo opcional explicando o quê e o porquê.
Nunca colar tokens, senhas ou dados de cliente aqui.
```

Tipos usados: `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, `test`.
Escopos comuns: `saude`, `sop`, `vendas`, `social`, `termos`, `ingestao`, `robustez`, `seguranca`.

Exemplos:
- `feat(social): capa e badge de vídeo nos posts`
- `fix(saude): remover métricas fake em Campanhas e marcar Radar como beta`
- `docs: registrar migração n8n → Supabase Edge Functions`

Se a mudança fecha uma issue, adicione no corpo: `Closes #123`.

## Checklist antes de abrir PR

- [ ] `npx tsc --noEmit` passa (zero erros)
- [ ] `npm run build` passa (build sem warning novo)
- [ ] Testei localmente com `npm run dev` — a feature/fix funciona no navegador
- [ ] Rodei a rotina relevante de [`SECURITY.md`](SECURITY.md) se a mudança tocou em ingestão/RLS
- [ ] Não commitou `.env`, arquivos com token, ou dados de cliente
- [ ] Descrição do PR explica o que muda e por que

## Review

- **Todo PR precisa de 1 aprovação** antes de merge
- Owner pode fazer merge próprio em fix crítico (produção down), mas comunica no canal
- Se o PR tem >500 linhas, considere quebrar em múltiplos menores
- Review foca em: correção, segurança, legibilidade. Não bike-shed sobre estilo

## Estilo de código

- **Não introduza libs sem discutir**. O projeto é enxuto de propósito (SVG puro, style inline, sem CSS-in-JS).
- **Padrões existentes**: consulte 2-3 arquivos parecidos antes de criar algo novo. Ex: pra hook de dados novo, veja `useMediaData.ts`; pra componente com tabela, veja `TermosPanel.tsx`.
- **Comentários**: só onde o "porquê" não é óbvio (regra de negócio, workaround). Não explique o "quê".

## Testando localmente

O projeto ainda não tem test suite formal. Antes de PR:
1. `npx tsc --noEmit`
2. `npm run build`
3. `npm run dev` e clica manual nas telas que você tocou
4. Se mexeu em ingestão / cron / Edge Function, rode a verificação diária de `SECURITY.md`

## Como pedir ajuda

- Dúvida técnica: comentário direto no PR ou issue
- Bloqueio: contate owner no canal privado
- Ideia de feature: abra issue com label `enhancement` antes de codar
