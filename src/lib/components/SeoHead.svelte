<script lang="ts">
  import type { SeoMetadata } from '$lib/seo';

  export let metadata: SeoMetadata;
</script>

<svelte:head>
  <title>{metadata.title}</title>
  <meta name="description" content={metadata.description} />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={metadata.canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="cs13a0" />
  <meta property="og:title" content={metadata.title} />
  <meta property="og:description" content={metadata.description} />
  <meta property="og:url" content={metadata.canonical} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={metadata.title} />
  <meta name="twitter:description" content={metadata.description} />
</svelte:head>
