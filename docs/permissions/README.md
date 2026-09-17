# Pedidos de permissão de uso de imagens e dados

Índice dos rascunhos de cartas para pedir licenças de imagens (logos, fotos) e acesso a dados que o cs13a0 **não** pode usar sem autorização escrita. Regra do projeto: escudos e avatares são gerados pelo jogo; bandeiras vêm do flag-icons (MIT); dados históricos vêm do texto da Liquipedia (CC BY-SA 3.0, com atribuição em `/credits`). Qualquer imagem real só entra quando uma permissão escrita estiver registrada aqui.

**Todos os documentos desta pasta são RASCUNHOS — NÃO ENVIADOS.** Nada foi enviado a ninguém. Contato do projeto: `contato@cs13a0.com`. Repositório: <https://github.com/joaomidowz/cs20a0>.

## Status

| Carta | Destinatário | Pede | Status |
| --- | --- | --- | --- |
| [`bo3gg.md`](./bo3gg.md) | bo3.gg | uso de dados e fotos em fan game gratuito e não comercial; termos e API | rascunho |
| [`liquipedia-images-lpdb.md`](./liquipedia-images-lpdb.md) | Liquipedia (Team Liquid) | fotos de jogadores e acesso à API LPDB; reconhece o uso do texto CC BY-SA já atribuído | rascunho |
| [`org-logo-template.md`](./org-logo-template.md) | organização de e-sports (modelo) | licença do logo da organização | rascunho (modelo) |

Estados possíveis: `rascunho` → `enviado` → `concedido` / `negado`. Uma carta só muda para `concedido` quando a resposta escrita estiver salva em [`granted/`](./granted/) e referenciada em `src/lib/data/licensed-images.json` (campo `license.evidence`), que `tests/licensedImages.test.ts` valida.

## Como registrar uma licença concedida

1. Salvar a resposta escrita (e-mail exportado em PDF ou texto) em `docs/permissions/granted/<slug>.<ext>`.
2. Colocar o arquivo de imagem em `static/licensed/<tipo>/<chave>.<ext>` (nunca hotlink, nunca imagem da Liquipedia, HLTV ou bo3.gg).
3. Adicionar a entrada em `src/lib/data/licensed-images.json`:

```json
{
  "kind": "org",
  "key": "astralis",
  "file": "licensed/orgs/astralis.svg",
  "license": {
    "holder": "Nome da organização",
    "type": "permissão escrita",
    "scope": "logo no cs13a0, uso não comercial, sem sublicenciamento",
    "grantedAt": "2026-01-31",
    "evidence": "astralis-2026-01-31.pdf"
  },
  "attribution": "Logo cedido por Nome da organização"
}
```

`kind` é `team` (chave = id do time-ano, ex. `astralis-2016`), `org` (chave = id da organização das identidades ou a chave do escudo gerado, ex. `astralis`) ou `player` (chave = `baseId`, ex. `device`). `TeamBadge.svelte` e `PlayerAvatar.svelte` preferem a imagem licenciada quando existe uma entrada; senão desenham o visual gerado.

4. Atualizar a tabela acima e a página `/credits` (linha de atribuição).
