# SEO técnico e descoberta do cs13a0

## Objetivo

Preparar o cs13a0 para descoberta no Google Search Console e para compartilhamento social, usando `https://cs13a0.com` como origem canônica. A implementação deve respeitar a aplicação SvelteKit estática existente, não alterar regras do jogo e não publicar nem fazer deploy.

## Domínio canônico

- Toda URL criada pelo código usa a origem `https://cs13a0.com`, sem `www`.
- Sitemap, `robots.txt`, links `canonical`, Open Graph e dados estruturados devem usar exatamente essa origem.
- Em 7 de setembro de 2026, a produção ainda responde com `308` de `https://cs13a0.com` para `https://www.cs13a0.com`. Antes da publicação definitiva, a configuração de domínios da Vercel deve ser invertida para servir o domínio sem `www` e redirecionar `www` para ele.
- Essa mudança externa de domínio, assim como push e deploy, não faz parte desta implementação local.

## Sitemap e rastreamento

Criar `static/sitemap.xml` em XML UTF-8 com as URLs públicas e canônicas:

- `/`
- `/online`
- `/teams`
- `/players`
- `/about`
- `/contact`
- `/privacy`
- `/terms`

`/online` entra porque a flag pública da produção está habilitada e a rota está acessível sem autenticação. `/sandbox` fica fora por ser uma ferramenta local/de desenvolvimento. Parâmetros de sala, seeds e qualquer estado compartilhável não entram no sitemap.

Criar `static/robots.txt` permitindo o rastreamento geral e declarando `Sitemap: https://cs13a0.com/sitemap.xml`. O arquivo não tenta esconder `/sandbox`, pois `robots.txt` não é mecanismo de privacidade nem de remoção de índice; a exclusão do sitemap é suficiente para o escopo atual.

Como `/sandbox` continua tecnicamente acessível pela SPA, sua página deve declarar `noindex, nofollow` no `svelte:head`.

## Metadados

Cada página pública recebe, por `svelte:head`:

- título único;
- descrição curta e própria;
- `link rel="canonical"` absoluto;
- `meta name="robots"` com indexação permitida;
- Open Graph (`og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`);
- Twitter Card (`twitter:card`, `twitter:title`, `twitter:description`).

A página inicial também recebe dados estruturados JSON-LD do tipo `WebApplication`, descrevendo o cs13a0 como jogo/simulador gratuito de Counter-Strike acessível no navegador. Nenhuma alegação de associação oficial com Valve, ESL, PGL ou HLTV será feita.

O JSON-LD deve declarar exatamente `applicationCategory: "GameApplication"` e `operatingSystem: "Web Browser"`.

`og:image` e `twitter:image` só serão emitidos se já houver no projeto uma imagem social apropriada. A inspeção encontrou apenas o favicon vetorial, que não é uma imagem de compartilhamento 1200×630; portanto, este incremento não adicionará essas duas propriedades nem criará uma imagem improvisada.

O projeto atual usa uma shell SPA com `ssr = false`. Os metadados de rota serão aplicados durante a hidratação do SvelteKit, o que atende ao renderizador JavaScript do Google, mas prévias sociais que não executam JavaScript podem usar metadados incompletos. Transformar as páginas institucionais em HTML pré-renderizado é uma melhoria posterior e está fora deste incremento para evitar alterar a arquitetura do jogo.

## Conteúdo semântico da home

Adicionar à home uma seção visível de aproximadamente 100 palavras em PT-BR. O texto explicará naturalmente que o cs13a0 é um simulador de draft e campeonato de Counter-Strike com jogadores e elencos históricos, referências a CS 1.6, CS:GO e CS2, campanha de Major, mapas, veto, posições, táticas, economia, utilitários e smokes.

Não será criada uma lista artificial com 100 palavras-chave nem a tag `meta name="keywords"`, pois ela é ignorada pelo Google Search. O texto deve ser útil para a pessoa que visita a página, sem repetição forçada de termos.

## Organização do código

- Concentrar origem canônica e composição de metadados em um módulo tipado e reutilizável.
- Criar um componente pequeno para emitir os elementos comuns de `svelte:head`, evitando duplicação entre rotas.
- Manter os textos específicos perto de cada rota ou em uma configuração explícita, seguindo os padrões TypeScript existentes e sem `any` implícito.
- Preservar o título e a descrição traduzida que já existem na home; o conteúdo SEO visível pode começar em PT-BR, conforme solicitado, sem interferir na mecânica de troca de idioma.

## Tratamento de erros e limites

- URLs serão montadas a partir de caminhos constantes, eliminando dependência de `window.location` para canonicalização.
- O JSON-LD será serializado de uma estrutura local controlada; não haverá entrada do usuário.
- Não serão adicionadas datas `lastmod` artificiais ao sitemap. Elas só devem existir quando puderem refletir uma alteração real de conteúdo.
- A implementação não garante indexação nem posição no Google; sitemap e metadados fornecem sinais de descoberta e relevância.

## Validação

- Validar `static/sitemap.xml` com um parser XML disponível no ambiente.
- Confirmar que sitemap e `robots.txt` usam apenas `https://cs13a0.com` e que `/sandbox` não aparece.
- Adicionar testes unitários para a configuração comum de SEO e para o conjunto de URLs do sitemap quando isso puder ser feito sem duplicar fontes de verdade; caso o XML permaneça estático, validar seu conteúdo diretamente em teste.
- Executar `npm run check` para Svelte e TypeScript.
- Executar `npm test`.
- Executar `npm run build` e inspecionar os artefatos `build/sitemap.xml` e `build/robots.txt`.
- Não executar push nem deploy.

## Critérios de aceite

- O build contém `/sitemap.xml` válido com todas as páginas públicas definidas e sem `/sandbox`.
- O build contém `/robots.txt` apontando para o sitemap canônico.
- Todas as referências SEO usam `https://cs13a0.com`, sem `www`.
- As páginas públicas têm título, descrição, canonical, Open Graph e Twitter Cards configurados.
- `/sandbox` declara `noindex, nofollow` e não aparece no sitemap.
- A home contém dados estruturados válidos com `GameApplication` e `Web Browser`, além de texto natural de aproximadamente 100 palavras.
- Check, testes e build passam localmente.
- O estado final permanece somente local, sem push nem deploy.
