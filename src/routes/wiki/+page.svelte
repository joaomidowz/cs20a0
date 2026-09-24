<script lang="ts">
  import PageLayout from '$lib/components/PageLayout.svelte';
  import SeoHead from '$lib/components/SeoHead.svelte';
  import { SEO_BY_ROUTE } from '$lib/seo';
  import { language, theme } from '$lib/game/pageState';
  import type { Language } from '$lib/game/types';

  type Question = { question: string; answer: string };
  type WikiCopy = {
    metaTitle: string;
    metaDescription: string;
    eyebrow: string;
    title: string;
    intro: string;
    plansTitle: string;
    plansIntro: string;
    plansCaption: string;
    plans: Question[];
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
      plansIntro: 'Um plano orienta como o time tenta jogar. Compare a proposta com as funções e os pontos fortes que sua line consegue colocar em prática.',
      plansCaption: 'Dúvidas sobre planos de jogo',
      plans: [
        { question: 'Existe um plano sempre melhor?', answer: 'Não. O encaixe depende da composição, das cartas e do que acontece durante a partida.' },
        { question: 'O que o Agressivo prioriza?', answer: 'Tomar espaço e iniciar jogadas. A line precisa conseguir acompanhar a entrada.' },
        { question: 'O que o Equilibrado valoriza?', answer: 'Uma line consistente, sem depender de uma única função para sustentar o plano.' },
        { question: 'Como funciona o Tático?', answer: 'A execução se apoia na leitura do IGL e na estrutura do time, incluindo suporte e coach.' },
        { question: 'O que define o Tempo?', answer: 'Ritmo e iniciativa. Observe se a entrada e o poder de fogo da line sustentam essa proposta.' },
        { question: 'O que significa jogar Reativo?', answer: 'Adaptar a resposta ao contexto da rodada, como lado, economia e escolhas do adversário.' },
        { question: 'O que significa jogar Resiliente?', answer: 'Priorizar controle emocional e recuperação ao longo de uma sequência de rounds e mapas.' },
        { question: 'Um plano countera outro de forma fixa?', answer: 'Não. O confronto surge das situações de jogo; não há uma tabela que garanta quem leva a melhor.' }
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
      plansIntro: 'A plan guides how a team tries to play. Compare its approach with the roles and strengths your lineup can put into practice.',
      plansCaption: 'Questions about game plans',
      plans: [
        { question: 'Is one plan always better?', answer: 'No. The fit depends on your lineup, its cards, and what happens during the match.' },
        { question: 'What does Aggressive prioritize?', answer: 'Taking space and starting plays. The lineup needs to follow up on the entry.' },
        { question: 'What does Balanced value?', answer: 'A consistent lineup that does not rely on a single role to carry out the plan.' },
        { question: 'How does Tactical work?', answer: 'Execution relies on the IGL’s read of the game and team structure, including support and coach.' },
        { question: 'What defines Tempo?', answer: 'Pace and initiative. Check whether the lineup’s entry and firepower can sustain that approach.' },
        { question: 'What does playing Reactive mean?', answer: 'Adapting to the round context, such as side, economy, and the opponent’s choices.' },
        { question: 'What does playing Resilient mean?', answer: 'Prioritizing composure and recovery across a run of rounds and maps.' },
        { question: 'Does one plan always counter another?', answer: 'No. Matchups emerge from game situations; no table guarantees who comes out ahead.' }
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
      plansIntro: 'Un plan orienta cómo intenta jugar el equipo. Compara su propuesta con los roles y las fortalezas que tu equipo puede poner en práctica.',
      plansCaption: 'Preguntas sobre los planes de juego',
      plans: [
        { question: '¿Hay un plan siempre mejor?', answer: 'No. El encaje depende de la composición, las cartas y lo que ocurre durante la partida.' },
        { question: '¿Qué prioriza el Agresivo?', answer: 'Tomar espacio e iniciar jugadas. El equipo debe poder acompañar la entrada.' },
        { question: '¿Qué valora el Equilibrado?', answer: 'Un equipo constante que no depende de un solo rol para sostener el plan.' },
        { question: '¿Cómo funciona el Táctico?', answer: 'La ejecución se apoya en la lectura del IGL y en la estructura del equipo, incluido el apoyo y el coach.' },
        { question: '¿Qué define al Tempo?', answer: 'El ritmo y la iniciativa. Comprueba si la entrada y la potencia de fuego del equipo sostienen la propuesta.' },
        { question: '¿Qué significa jugar Reactivo?', answer: 'Adaptar la respuesta al contexto de la ronda, como el lado, la economía y las decisiones rivales.' },
        { question: '¿Qué significa jugar Resiliente?', answer: 'Priorizar la calma y la recuperación a lo largo de una secuencia de rondas y mapas.' },
        { question: '¿Un plan siempre contrarresta a otro?', answer: 'No. Los enfrentamientos surgen de las situaciones de juego; ninguna tabla garantiza quién tendrá ventaja.' }
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
        <table>
          <caption>{copy.plansCaption}</caption>
          <thead><tr><th scope="col">{copy.questionLabel}</th><th scope="col">{copy.explanationLabel}</th></tr></thead>
          <tbody>
            {#each copy.plans as item (item.question)}
              <tr><th scope="row">{item.question}</th><td>{item.answer}</td></tr>
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
  caption { padding: .55rem 0; color: var(--muted); font-size: .75rem; font-weight: 700; text-align: left; }
  th, td { border: 1px solid var(--line); padding: .65rem .75rem; text-align: left; vertical-align: top; }
  thead th { color: var(--muted); font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; }
  tbody th { width: 38%; font-weight: 700; }
  tbody td { color: var(--muted); }
  .wiki-foot { padding-top: .9rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; line-height: 1.55; }
</style>
