# Links promocionais com coins (stories)

## Objetivo

Um link por dia nos stories (`cs13a0.com/online/promo/CODIGO`) dá coins a quem entra por ele, limitado aos N primeiros. Decisões do dono (2026-10-07): o bônus soma ao saldo (contas novas já ganham as 10.000 de boas-vindas); cada código decide se vale só para contas novas ou para qualquer conta; administração com a própria conta (`ADMIN_EMAILS`), sem token solto.

## Desenho

- **Banco (migração 38)**: `promo_links` (código, bônus, vagas, usos, só-novas, validade, criador), `promo_link_redemptions` (código + usuário, uma vez), `magic_links.promo_code`, razão `promo_link` no `ledger`.
- **Servidor** (`server/promo-links/service.ts`): `redeemPromoLink` dentro da transação de quem chama; a vaga é decidida por `UPDATE … WHERE uses < max_uses RETURNING` (duas pessoas nunca levam a última); resultados `granted | invalid | expired | sold_out | already | not_new`, nunca lança. O código viaja na linha do magic link (`/auth/request { promo }`), porque no celular o e-mail abre em outro navegador; `grantSession` resgata depois das boas-vindas e devolve `promo` na resposta do `/auth/verify`. Rotas: `GET /promo-links/:code` (público, sem e-mails), `POST /promo-links/redeem` (logado; contas antigas em códigos abertos), `GET/POST /admin/promo-links`, `POST /admin/promo-links/:code/disable` (só e-mails de `ADMIN_EMAILS`; `AuthUser.admin`).
- **Cliente**: `/online/promo/[code]` (client-rendered) mostra o presente, as vagas e para quem vale; guarda o código em `localStorage` (7 dias); deslogado vai para `/online/conta`, que envia o código no pedido de link e mostra o banner pendente; logado resgata na hora. Toast de sucesso e a carteira anima o ganho. `/online?promo=CODIGO` redireciona para a vitrine. Painel admin em `/online/conta` (criar, copiar link, desativar, usos).

## Reuso de código (2026-10-09)

O dono solta um link por dia e quer repetir o código. Migração 39: cada campanha é uma linha com `id`; só uma linha viva (`NOT archived`) por código (índice único parcial); resgates apontam para a campanha (`link_id`). Criar um código que já existe: se a campanha viva acabou (expirada, desativada ou esgotada) ela é arquivada e a nova nasce com vagas zeradas, e quem resgatou a antiga pode resgatar a nova; se ainda está ativa, `409 CODE_TAKEN`. O painel lista as arquivadas apagadas, como histórico.

## Operação

- Railway: `ADMIN_EMAILS=jgcustodio2005@gmail.com` (lista separada por vírgula).
- Limites: 60 consultas de código por IP e 10 resgates por usuário a cada 15 min; os pedidos de login seguem com os limites de sempre.
- Testes: `tests/onlinePromoLinks.test.ts` (precisa de `TEST_DATABASE_URL`).
