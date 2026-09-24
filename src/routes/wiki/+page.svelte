<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import { SEO_BY_ROUTE } from '$lib/seo';
  import { language, theme } from '$lib/game/pageState';
  import type { Language } from '$lib/game/types';

  type Question = { question: string; answer: string };
  type PlanInsight = { plan: string; helpsWhen: string; watchFor: string };
  type WikiCopy = {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    intro: string;
    plansTitle: string;
    plansIntro: string;
    plansCaption: string;
    planLabel: string;
    helpsWhenLabel: string;
    watchForLabel: string;
    plans: PlanInsight[];
    contextTitle: string;
    contextCaption: string;
    context: Question[];
    starTitle: string;
    starCaption: string;
    star: Question[];
    questionLabel: string;
    explanationLabel: string;
    scrollHint: string;
    footer: string;
  };

  const wikiCopy: Record<Language, WikiCopy> = {
    'pt-BR': {
      metaTitle: 'Wiki do jogo · cs13a0',
      metaDescription: 'Explicações curtas sobre planos de jogo, variação das séries e construção da line no cs13a0.',
      eyebrow: 'GUIA',
      title: 'Wiki do cs13a0',
      intro: 'Respostas curtas sobre as escolhas que moldam sua line. As tabelas explicam as mecânicas; cada partida ainda depende do contexto do jogo.',
      plansTitle: 'Planos de jogo',
      plansIntro: 'Cada plano tem situações em que pode ajudar e pontos que pedem atenção. Essas tendências não garantem vantagem: economia, mapa, lado e decisões também pesam.',
      plansCaption: 'Onde cada plano pode ajudar e o que observar',
      planLabel: 'Plano',
      helpsWhenLabel: 'Ajuda quando',
      watchForLabel: 'Exige cuidado quando',
      plans: [
        { plan: 'Agressivo', helpsWhen: 'A line consegue converter entradas em espaço e sustentar sequências de rounds.', watchFor: 'O plano depende de a line acompanhar as entradas; a proposta Tática não é um counter fixo.' },
        { plan: 'Equilibrado', helpsWhen: 'A consistência importa e o time consegue aproveitar vitórias de pistola nos rounds seguintes.', watchFor: 'Contra o Resiliente, neutraliza parte dos bônus situacionais de recuperação desse plano.' },
        { plan: 'Tático', helpsWhen: 'O estudo está forte em relação ao perfil de entrada e poder de fogo da própria line, que consegue executar a leitura.', watchFor: 'O Tempo pode pressionar quando embala; essa interação depende do momentum.' },
        { plan: 'Tempo', helpsWhen: 'O time quer começar forte nas pistolas e pressionar o Tático quando constrói momentum.', watchFor: 'A pressão sobre o Tático depende de uma sequência favorável; não é uma vantagem fixa.' },
        { plan: 'Reativo', helpsWhen: 'O rival está de eco ou force, ou a própria economia está quebrada e pede adaptação.', watchFor: 'Sua vantagem específica aparece nesses apertos econômicos, não em todo confronto.' },
        { plan: 'Resiliente', helpsWhen: 'O time precisa absorver derrotas e valoriza clutch, overtime e mapas decisivos.', watchFor: 'O Equilibrado neutraliza parte dos bônus de recuperação do Resiliente.' }
      ],
      contextTitle: 'O contexto da partida',
      contextCaption: 'Dúvidas sobre o andamento da partida',
      context: [
        { question: 'Por que a mesma line pode jogar diferente?', answer: 'A série inclui variações de desempenho. Elas mudam o cenário, mas não determinam o resultado antes de jogar.' },
        { question: 'Economia e momentum importam?', answer: 'Sim. Eles mudam as opções de cada rodada e podem alterar como o plano funciona naquele momento.' },
        { question: 'Um round define a série?', answer: 'Uma rodada afeta recursos e ritmo. As decisões seguintes continuam influenciando o que acontece.' },
        { question: 'Mapa e lado mudam a leitura?', answer: 'Sim. Considere o mapa, o lado e as características da line ao entender uma partida.' }
      ],
      starTitle: 'Construindo em volta da estrela',
      starCaption: 'Dúvidas sobre estrela e composição',
      star: [
        { question: 'O que a estrela faz?', answer: 'Ela concentra parte da sinergia da line em uma carta. O efeito depende da função, do plano e da composição.' },
        { question: 'Como escolher quem será a estrela?', answer: 'Procure uma carta que combine com o plano e com as funções do time. O editor indica quando a escolha não atende aos critérios.' },
        { question: 'Uma carta rara garante a vitória?', answer: 'Não. A raridade influencia o bônus da estrela, mas não substitui encaixe, funções e decisões durante a partida.' },
        { question: 'Dá para montar o time só em volta dela?', answer: 'A estrela ajuda, mas a line ainda precisa ter estrutura para executar o plano escolhido.' }
      ],
      questionLabel: 'Dúvida',
      explanationLabel: 'Explicação',
      scrollHint: 'Tabela rolável horizontalmente',
      footer: 'Use as tabelas para entender as escolhas, não como fórmula de placar. O simulador resolve a partida rodada a rodada.'
    },
    en: {
      metaTitle: 'Game wiki · cs13a0',
      metaDescription: 'Short explanations of game plans, series variation, and lineup building in cs13a0.',
      eyebrow: 'GUIDE',
      title: 'cs13a0 Wiki',
      intro: 'Quick answers about the choices that shape your lineup. These tables explain the mechanics; each match still depends on the game context.',
      plansTitle: 'Game plans',
      plansIntro: 'Each plan can help in some situations and has tradeoffs to watch. These tendencies do not guarantee an edge: economy, map, side, and decisions matter too.',
      plansCaption: 'When each plan can help and what to watch for',
      planLabel: 'Plan',
      helpsWhenLabel: 'Can help when',
      watchForLabel: 'Watch for',
      plans: [
        { plan: 'Aggressive', helpsWhen: 'The lineup can turn entries into space and sustain winning streaks.', watchFor: 'The plan depends on the lineup following up on entries; Tactical is not a fixed counter.' },
        { plan: 'Balanced', helpsWhen: 'Consistency matters and the team can carry pistol-round wins into later rounds.', watchFor: 'Against Resilient, it suppresses some of that plan’s situational recovery bonuses.' },
        { plan: 'Tactical', helpsWhen: 'The team’s study is strong relative to its own entry and firepower profile, and the lineup can execute its reads.', watchFor: 'Tempo can apply pressure when it gets rolling; this interaction depends on momentum.' },
        { plan: 'Tempo', helpsWhen: 'The team wants a strong start in pistol rounds and can pressure Tactical by building momentum.', watchFor: 'Pressure on Tactical depends on a favorable run; it is not a fixed edge.' },
        { plan: 'Reactive', helpsWhen: 'The opponent is on eco or force, or the team’s own economy is broken and needs adapting.', watchFor: 'Its specific edge appears in these economic situations, not in every matchup.' },
        { plan: 'Resilient', helpsWhen: 'The team needs to absorb losses and values clutches, overtime, and deciding maps.', watchFor: 'Balanced suppresses some of Resilient’s recovery bonuses.' }
      ],
      contextTitle: 'Match context',
      contextCaption: 'Questions about how a match unfolds',
      context: [
        { question: 'Why can the same lineup play differently?', answer: 'A series includes performance variation. It changes the situation, but does not decide the result before play.' },
        { question: 'Do economy and momentum matter?', answer: 'Yes. They change the options available each round and can affect how a plan works in that moment.' },
        { question: 'Does one round decide the series?', answer: 'A round affects resources and pace. The decisions that follow still shape what happens.' },
        { question: 'Do map and side change the picture?', answer: 'Yes. Consider the map, side, and lineup traits when reading a match.' }
      ],
      starTitle: 'Building around a star',
      starCaption: 'Questions about stars and team composition',
      star: [
        { question: 'What does the star do?', answer: 'It focuses part of the lineup’s synergy on one card. The effect depends on role, plan, and composition.' },
        { question: 'How should I choose a star?', answer: 'Look for a card that fits the plan and the team’s roles. The builder shows when a pick does not meet its criteria.' },
        { question: 'Does a rare card guarantee a win?', answer: 'No. Rarity affects the star bonus, but it cannot replace fit, roles, or decisions during a match.' },
        { question: 'Can I build the whole team around the star?', answer: 'The star helps, but the lineup still needs the structure to execute its chosen plan.' }
      ],
      questionLabel: 'Question',
      explanationLabel: 'Explanation',
      scrollHint: 'Horizontally scrollable table',
      footer: 'Use these tables to understand your choices, not as a score formula. The simulator resolves the match round by round.'
    },
    es: {
      metaTitle: 'Wiki del juego · cs13a0',
      metaDescription: 'Explicaciones breves sobre planes de juego, variación de las series y composición del equipo en cs13a0.',
      eyebrow: 'GUÍA',
      title: 'Wiki de cs13a0',
      intro: 'Respuestas breves sobre las decisiones que definen tu equipo. Las tablas explican las mecánicas; cada partida también depende del contexto del juego.',
      plansTitle: 'Planes de juego',
      plansIntro: 'Cada plan puede ayudar en ciertas situaciones y tiene aspectos que conviene vigilar. Estas tendencias no garantizan ventaja: también influyen la economía, el mapa, el lado y las decisiones.',
      plansCaption: 'Cuándo puede ayudar cada plan y qué conviene vigilar',
      planLabel: 'Plan',
      helpsWhenLabel: 'Ayuda cuando',
      watchForLabel: 'Conviene vigilar',
      plans: [
        { plan: 'Agresivo', helpsWhen: 'El equipo puede convertir las entradas en espacio y mantener una racha de rondas.', watchFor: 'El plan depende de que el equipo acompañe las entradas; Táctico no es un counter fijo.' },
        { plan: 'Equilibrado', helpsWhen: 'La constancia importa y el equipo puede aprovechar las victorias en pistola en las rondas siguientes.', watchFor: 'Contra Resiliente, neutraliza parte de los bonus situacionales de recuperación de ese plan.' },
        { plan: 'Táctico', helpsWhen: 'El estudio es fuerte en relación con el perfil de entrada y potencia de fuego del propio equipo, que puede ejecutar sus lecturas.', watchFor: 'Tempo puede presionar cuando toma impulso; esta interacción depende del momentum.' },
        { plan: 'Tempo', helpsWhen: 'El equipo busca empezar fuerte en pistola y puede presionar a Táctico al acumular momentum.', watchFor: 'La presión sobre Táctico depende de una racha favorable; no es una ventaja fija.' },
        { plan: 'Reactivo', helpsWhen: 'El rival está de eco o force, o la economía propia está quebrada y exige adaptación.', watchFor: 'Su ventaja específica aparece en esas situaciones económicas, no en todos los enfrentamientos.' },
        { plan: 'Resiliente', helpsWhen: 'El equipo necesita recuperarse de derrotas y valora clutch, overtime y mapas decisivos.', watchFor: 'Equilibrado neutraliza parte de los bonus de recuperación de Resiliente.' }
      ],
      contextTitle: 'El contexto de la partida',
      contextCaption: 'Preguntas sobre el desarrollo de la partida',
      context: [
        { question: '¿Por qué puede jugar distinto el mismo equipo?', answer: 'La serie incluye variaciones de rendimiento. Cambian el escenario, pero no deciden el resultado antes de jugar.' },
        { question: '¿Importan la economía y el momentum?', answer: 'Sí. Cambian las opciones de cada ronda y pueden afectar cómo funciona el plan en ese momento.' },
        { question: '¿Una ronda decide la serie?', answer: 'Una ronda afecta los recursos y el ritmo. Las decisiones posteriores siguen influyendo.' },
        { question: '¿El mapa y el lado cambian la lectura?', answer: 'Sí. Ten en cuenta el mapa, el lado y las características del equipo al analizar una partida.' }
      ],
      starTitle: 'Construir alrededor de la estrella',
      starCaption: 'Preguntas sobre la estrella y la composición',
      star: [
        { question: '¿Qué hace la estrella?', answer: 'Concentra parte de la sinergia del equipo en una carta. El efecto depende del rol, el plan y la composición.' },
        { question: '¿Cómo elegir a la estrella?', answer: 'Busca una carta que encaje con el plan y los roles del equipo. El editor avisa si la elección no cumple los criterios.' },
        { question: '¿Una carta rara garantiza la victoria?', answer: 'No. La rareza influye en el bonus de la estrella, pero no sustituye el encaje, los roles ni las decisiones.' },
        { question: '¿Puedo construir todo alrededor de la estrella?', answer: 'La estrella ayuda, pero el equipo aún necesita estructura para ejecutar el plan elegido.' }
      ],
      questionLabel: 'Pregunta',
      explanationLabel: 'Explicación',
      scrollHint: 'Tabla con desplazamiento horizontal',
      footer: 'Usa estas tablas para entender las decisiones, no como fórmula del marcador. El simulador resuelve la partida ronda a ronda.'
    }
  };

  $: copy = wikiCopy[$language];
  $: wikiMetadata = {
    ...SEO_BY_ROUTE['/wiki'],
    title: copy.metaTitle,
    description: copy.metaDescription
  };
</script>

<SeoHead metadata={wikiMetadata} />

<PageLayout
  language={$language}
  theme={$theme}
  onLanguage={(value) => $language = value}
  onTheme={() => $theme = $theme === 'dark' ? 'light' : 'dark'}
  onlineNavigation={false}
>
  <div class="wiki">
    <header class="wiki-head">
      <span class="eyebrow">{copy.eyebrow}</span>
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
    </header>

    <section class="wiki-section" aria-labelledby="plans-title">
      <h2 id="plans-title">{copy.plansTitle}</h2>
      <p class="section-intro">{copy.plansIntro}</p>
      <div class="wiki-table-wrap" role="region" aria-label={copy.scrollHint}>
        <table class="plan-matchups">
          <caption>{copy.plansCaption}</caption>
          <thead><tr><th scope="col">{copy.planLabel}</th><th scope="col">{copy.helpsWhenLabel}</th><th scope="col">{copy.watchForLabel}</th></tr></thead>
          <tbody>
            {#each copy.plans as item (item.plan)}
              <tr><th scope="row">{item.plan}</th><td>{item.helpsWhen}</td><td>{item.watchFor}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="wiki-section" aria-labelledby="context-title">
      <h2 id="context-title">{copy.contextTitle}</h2>
      <div class="wiki-table-wrap" role="region" aria-label={copy.scrollHint}>
        <table>
          <caption>{copy.contextCaption}</caption>
          <thead><tr><th scope="col">{copy.questionLabel}</th><th scope="col">{copy.explanationLabel}</th></tr></thead>
          <tbody>
            {#each copy.context as item (item.question)}
              <tr><th scope="row">{item.question}</th><td>{item.answer}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <section class="wiki-section" aria-labelledby="star-title">
      <h2 id="star-title">{copy.starTitle}</h2>
      <div class="wiki-table-wrap" role="region" aria-label={copy.scrollHint}>
        <table>
          <caption>{copy.starCaption}</caption>
          <thead><tr><th scope="col">{copy.questionLabel}</th><th scope="col">{copy.explanationLabel}</th></tr></thead>
          <tbody>
            {#each copy.star as item (item.question)}
              <tr><th scope="row">{item.question}</th><td>{item.answer}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <footer class="wiki-foot">{copy.footer}</footer>
  </div>
</PageLayout>

<style>
  .wiki { display: grid; gap: 1.5rem; }
  .wiki-head { max-width: 760px; }
  .wiki-head .eyebrow { color: var(--accent, #c6fa36); font-size: .8rem; letter-spacing: .12em; }
  .wiki-head h1 { margin: .25rem 0 .5rem; }
  .wiki-head p, .section-intro { max-width: 72ch; color: var(--muted); line-height: 1.6; }
  .wiki-section { display: grid; gap: .65rem; margin: 0; padding: 1.1rem; border: 1px solid var(--line); background: var(--surface); }
  .wiki-section h2 { margin: 0; font-size: 1.15rem; }
  .section-intro { margin: 0; }
  .wiki-table-wrap { overflow-x: auto; margin: .25rem 0; outline-color: var(--accent); outline-offset: 3px; }
  table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: .9rem; line-height: 1.55; }
  .plan-matchups { min-width: 760px; }
  caption { padding: .55rem 0; color: var(--muted); font-size: .75rem; font-weight: 700; text-align: left; }
  th, td { border: 1px solid var(--line); padding: .65rem .75rem; text-align: left; vertical-align: top; }
  thead th { color: var(--muted); font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; }
  tbody th { width: 38%; font-weight: 700; }
  tbody td { color: var(--muted); }
  .wiki-foot { padding-top: .9rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; line-height: 1.55; }
</style>
