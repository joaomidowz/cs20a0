# SEO público com pré-render — design

## Problema confirmado

O domínio entrega `index.html` como shell de SPA. No HTML recebido sem JavaScript não existem `<title>`, meta description, canonical, JSON-LD nem conteúdo visível. Os metadados e o texto já existentes só aparecem depois da hidratação, o que deixa o Google livre para mostrar apenas `cs13a0` e a URL.

## Solução

- Ativar SSR de build e pré-render estático no SvelteKit para todas as rotas conhecidas.
- Preservar a hidratação e todo o comportamento client-side do jogo depois do carregamento.
- Reutilizar `SeoHead`, `SEO_BY_ROUTE`, `HOME_SEO_COPY` e o conteúdo já escrito; não criar texto oculto nem repetir palavras-chave artificialmente.
- Garantir que cada página pública entregue no HTML inicial título, description, robots, canonical e Open Graph específicos.
- Manter páginas privadas/operacionais com `noindex` conforme já definido.
- Manter e validar o JSON-LD `WebApplication` da Home e adicionar `WebSite`/`Organization` apenas com fatos já presentes no projeto.
- Enriquecer o sitemap com `lastmod`, `changefreq` e `priority` coerentes.
- Preservar `robots.txt` permitindo crawl e apontando para o sitemap canônico.

## Compatibilidade

Qualquer acesso a `window`, `document`, `localStorage` ou APIs do navegador durante SSR será movido para guardas `browser`/`onMount`, sem mudar o comportamento no navegador. Rotas de coleção, conta e partidas continuam funcionando como aplicações hidratadas.

## Indicadores visuais antigos

As bordas laterais grossas dos totais e sinergias serão substituídas por borda completa sutil e cor de texto/estado. A semântica positivo, negativo e total continua igual, sem aparência de aba lateral.

## Verificação

- Build estático precisa gerar HTML por rota pública.
- O HTML de `/`, `/teams`, `/players`, `/wiki` e `/online` deve conter título, description, canonical e conteúdo antes do JavaScript.
- Rotas privadas devem conservar `noindex`.
- `svelte-check`, testes de SEO e build devem passar.
- Depois do deploy, consultar o HTML público e confirmar os metadados reais.

## Limite externo

A mudança melhora a capacidade de indexação imediatamente, mas o Google escolhe quando recrawl e como exibe o snippet. Solicitar reindexação no Search Console continua sendo uma etapa externa do proprietário.
