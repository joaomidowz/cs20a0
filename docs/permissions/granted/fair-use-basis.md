# Base legal para uso de logos reais de organizações (fair use / uso nominativo)

**Isto não é uma licença nem uma permissão concedida pelas organizações.** É a justificativa documentada, escrita por nós, pra decidir usar o logo real de uma organização de esports sem autorização escrita dela — uma decisão consciente de risco, não uma alegação de ter permissão.

## Situação verificada

Checamos se organizações de esports (ex: DENDELE CS, ex-Sharks Esports) publicam um press kit ou termos de uso de marca que autorizem esse uso. Não encontramos nenhum press kit público com termos claros — isso é o padrão pra praticamente todo time de esports, não uma exceção. Ou seja: não existe permissão explícita disponível pra citar como evidência real de licença.

## Precedente de mercado

Verificamos que concorrentes diretos (ex: roadtomajor.com.br) usam logos reais de times de CS sem licença formal, cobrindo o risco só com um disclaimer de não afiliação nos Termos de Uso:

> "Road to Major é um produto comercial independente, não afiliado, patrocinado, autorizado ou endossado pela Valve Corporation, HLTV, Liquipedia, equipes ou jogadores representados. Counter-Strike e marcas relacionadas pertencem a seus respectivos titulares." (roadtomajor.com.br/termos, consultado em 2026-09-17)

## Nossa decisão

Usar o logo real de uma organização como **uso nominativo** (identificar a organização retratada, sem sugerir endosso, patrocínio ou afiliação) é uma prática comum e tolerada nesse mercado — mas continua sendo uso sem permissão explícita, com risco legal real (ainda que baixo na prática observada). Decisão tomada com o usuário, ciente do risco, em 2026-09-17.

Mitigação adotada:
- Disclaimer equivalente ao do concorrente citado, na página `/credits`: o projeto não é afiliado, patrocinado, autorizado ou endossado pela Valve, HLTV, Liquipedia, ou pelas organizações/jogadores representados.
- Cada entrada de logo em `licensed-images.json` referencia este documento como evidência (`type: "fair use / uso nominativo, sem afiliação"`), deixando explícito no próprio dado que **não há permissão da organização** — só a nossa justificativa de uso.
- Se qualquer organização pedir remoção, o logo dela sai imediatamente (sem discussão).

## Não fazer

Nunca registrar uma entrada dizendo `type: "permissão escrita"` ou citar uma organização como `holder` de uma licença que ela não concedeu. Esse documento existe exatamente pra manter essa distinção honesta no dado.
