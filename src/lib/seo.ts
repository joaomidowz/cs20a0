export const SITE_ORIGIN = 'https://cs13a0.com' as const;

export const PUBLIC_ROUTES = [
  '/',
  '/online',
  '/teams',
  '/players',
  '/about',
  '/contact',
  '/privacy',
  '/terms'
] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
}

const ROUTE_COPY: Record<PublicRoute, Omit<SeoMetadata, 'canonical'>> = {
  '/': {
    title: 'cs13a0 · Monte sua line e sobreviva ao Major',
    description: 'Monte uma line histórica de Counter-Strike, escolha funções e dispute um Major simulado por seed no cs13a0.'
  },
  '/online': {
    title: 'Major online de Counter-Strike · cs13a0',
    description: 'Crie uma sala, reúna de 2 a 16 jogadores e dispute online o draft e o Major histórico do cs13a0.'
  },
  '/teams': {
    title: 'Times históricos de Counter-Strike · cs13a0',
    description: 'Explore elencos históricos de Counter-Strike organizados por ano e conheça os times disponíveis no draft do cs13a0.'
  },
  '/players': {
    title: 'Ranking de jogadores de Counter-Strike · cs13a0',
    description: 'Compare jogadores históricos por função, overall, temporada e equipe antes de montar sua line no cs13a0.'
  },
  '/about': {
    title: 'Sobre o simulador cs13a0',
    description: 'Conheça o projeto independente cs13a0, um simulador de draft e campanha de Major inspirado na história do Counter-Strike.'
  },
  '/contact': {
    title: 'Contato · cs13a0',
    description: 'Envie sugestões, correções de dados e comentários para a equipe do simulador independente de Counter-Strike cs13a0.'
  },
  '/privacy': {
    title: 'Política de Privacidade · cs13a0',
    description: 'Entenda como o cs13a0 trata armazenamento local, dados da experiência online, serviços externos e informações de contato.'
  },
  '/terms': {
    title: 'Termos de Uso · cs13a0',
    description: 'Consulte os termos de uso, avisos de marcas, regras de conduta e condições do projeto independente cs13a0.'
  }
};

export const getCanonicalUrl = (path: PublicRoute) => `${SITE_ORIGIN}${path}`;

export const SEO_BY_ROUTE: Record<PublicRoute, SeoMetadata> = Object.fromEntries(
  PUBLIC_ROUTES.map((path) => [path, { ...ROUTE_COPY[path], canonical: getCanonicalUrl(path) }])
) as Record<PublicRoute, SeoMetadata>;

export const HOME_SEO_COPY = 'No cs13a0, você monta uma line de Counter-Strike com jogadores e elencos históricos, das raízes do CS 1.6 às eras do CS:GO e CS2. Escolha funções, combine posições e dispute um campeonato completo em uma campanha de Major simulada por seed. Cada jornada envolve mapas competitivos, veto, economia, táticas, utilitários e smokes, além de decisões que mudam o rumo das partidas. Compare estrelas, AWPers, riflers, capitães e suportes de diferentes temporadas, teste estilos de jogo e crie confrontos que nunca aconteceram. O cs13a0 é gratuito, roda no navegador e transforma a história competitiva em um desafio estratégico.';

export const HOME_STRUCTURED_DATA = Object.freeze({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'cs13a0',
  url: getCanonicalUrl('/'),
  description: SEO_BY_ROUTE['/'].description,
  applicationCategory: 'GameApplication',
  applicationSubCategory: 'Counter-Strike draft and Major simulator',
  operatingSystem: 'Web Browser',
  browserRequirements: 'Requires a modern browser with JavaScript enabled.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'BRL'
  }
});
