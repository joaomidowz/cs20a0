<script lang="ts">
  import type { SeoMetadata } from '$lib/seo';

  export let metadata: SeoMetadata;
</script>

<svelte:head>
  <title>{metadata.title}</title>
  <meta name="description" content={metadata.description} />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={metadata.canonical} />
  <!-- og:type/og:site_name/og:image/twitter:card ficam estáticos em app.html (SPA sem SSR). -->
  <meta property="og:title" content={metadata.title} />
  <meta property="og:description" content={metadata.description} />
  <meta property="og:url" content={metadata.canonical} />
  <meta name="twitter:title" content={metadata.title} />
  <meta name="twitter:description" content={metadata.description} />
</svelte:head>
