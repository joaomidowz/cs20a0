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
  <meta property="og:image" content="https://cs13a0.com/og/cs13a0-og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={metadata.title} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={metadata.title} />
  <meta name="twitter:description" content={metadata.description} />
  <meta name="twitter:image" content="https://cs13a0.com/og/cs13a0-og.png" />
</svelte:head>
