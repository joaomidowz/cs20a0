# Base legal para uso de foto real de jogador (fair use editorial / figura pública)

**Isto não é uma licença nem uma permissão concedida pelo jogador ou por qualquer organização.** É a justificativa documentada, escrita por nós, pra decidir usar a foto real de um jogador profissional de esports sem autorização escrita dele.

## Diferença em relação ao logo de organização

O caso do logo real de organização (`fair-use-basis.md`) é sobre **marca**: uso nominativo de um símbolo comercial pra identificar uma entidade. Foto de jogador é diferente: é a **imagem de uma pessoa real e identificável**, que no Brasil tem proteção própria (direito de imagem, art. 20 do Código Civil), separada do direito de marca.

## Situação verificada

- Os jogadores retratados são profissionais de CS ativos ou ex-ativos em competições públicas de alto nível (Majors e eventos equivalentes), cuja imagem nesse contexto profissional já circula amplamente em cobertura de imprensa, transmissões ao vivo e material promocional dos próprios eventos e organizações.
- As fotos usadas vêm de infoboxes de jogador da Liquipedia — material de referência já publicado e associado à carreira profissional pública de cada jogador, não fotos privadas ou de contexto não relacionado ao esporte.
- Não existe press kit individual de jogador com termos de uso claros pra citar como evidência de licença — isso não é exceção, é o padrão do setor.

## Nossa decisão

Usar a foto de um jogador estritamente no contexto da própria carreira competitiva dele (o mesmo jogo, o mesmo tipo de competição que ele de fato jogou) é uma prática de uso editorial/nominativo sobre figura pública em contexto profissional — mas continua sendo uso sem consentimento explícito da pessoa, com risco legal real (maior que o do logo de organização, por envolver direito de imagem de pessoa física, não só marca). Decisão tomada com o usuário, ciente dessa diferença de risco, em 2026-09-17.

Mitigação adotada:
- A foto só aparece associada ao mesmo contexto profissional real do jogador (time, ano, papel competitivo) — nunca reaproveitada fora desse contexto.
- Disclaimer de não afiliação já existente em `/credits` cobre também esse uso (o jogador retratado não endossa nem patrocina o jogo).
- Cada entrada de foto em `licensed-images.json` referencia este documento como evidência (`type: "fair use editorial / figura pública, sem consentimento"`), deixando explícito no próprio dado que **não há permissão da pessoa retratada**.
- Se qualquer jogador pedir remoção, a foto sai imediatamente (sem discussão) — essa é a mitigação mais importante desse caso específico, por ser pessoa física.

## Não fazer

Nunca registrar uma entrada dizendo `type: "permissão concedida"` ou citar o jogador como `holder` de uma licença que ele não deu. Nunca usar a foto fora do contexto da carreira competitiva real do jogador (nada de contexto ofensivo, humorístico às custas da pessoa, ou que sugira endosso).
