# cs13a0

Draft e simulador de Major inspirado em eras competitivas de Counter-Strike.

## Desenvolvimento

```bash
npm install
npm run dev
```

Validacao local:

```bash
npm run validate
```

## Fluxo de dados

O cs13a0 consome apenas dois arquivos finais:

- `src/lib/data/cs/players.game.json`
- `src/lib/data/cs/teams.game.json`

A edição visual dos dados é feita fora deste repo, no projeto local `cs13a0-data-studio`.

Depois de editar os dados no Data Studio, exporte os dois JSONs finais para esta pasta e rode:

```bash
npm run dev
```

ou

```bash
npm run build
```

Este repo nao publica admin local, editor visual, scripts de curadoria ou pipeline pesada no fluxo principal do jogo. A pipeline historica foi isolada em `legacy-data-pipeline/` apenas como referencia.
