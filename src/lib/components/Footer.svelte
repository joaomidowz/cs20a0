<script lang="ts">
  export let labels: {
    description: string;
    support: string;
    contact: string;
    disclaimer: string;
  };

  const currentYear = new Date().getFullYear();
</script>

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <strong>cs13a0</strong>
      <p>{labels.description}</p>
    </div>

    <div class="footer-actions">
      <a class="support-link" href="https://ko-fi.com/cs13a0" target="_blank" rel="noopener noreferrer">
        {labels.support}
      </a>
      <a href="mailto:contato@cs13a0.com"><span>{labels.contact}</span> contato@cs13a0.com</a>
    </div>

    <p class="footer-disclaimer">{labels.disclaimer}</p>
    <small>© {currentYear} cs13a0</small>
  </div>
</footer>

<style>
  .site-footer{margin-top:48px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--surface) 82%,transparent)}
  .footer-inner{display:grid;gap:22px;width:min(1180px,calc(100% - 32px));margin:0 auto;padding:28px 0}
  .footer-brand strong{color:var(--accent);font:900 1.8rem 'Barlow Condensed',sans-serif;text-transform:uppercase}
  .footer-brand p,.footer-disclaimer{margin:7px 0 0;color:var(--muted);font-size:.72rem;line-height:1.65}
  .footer-actions{display:flex;flex-direction:column;align-items:flex-start;gap:12px}
  .footer-actions a{color:var(--text);font-size:.7rem;font-weight:700;text-decoration:none}
  .footer-actions a span{color:var(--muted);font-weight:500}
  .footer-actions .support-link{padding:10px 14px;border:1px solid color-mix(in srgb,var(--accent) 55%,var(--line));color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--surface));text-transform:uppercase}
  .footer-actions .support-link:hover{background:color-mix(in srgb,var(--accent) 14%,var(--surface))}
  .footer-disclaimer{padding-top:18px;border-top:1px solid var(--line)}
  .footer-inner>small{color:var(--muted);font-size:.62rem}
  a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}

  @media (min-width:680px){
    .footer-inner{grid-template-columns:1.2fr .8fr;padding:34px 0}
    .footer-actions{align-items:flex-end}
    .footer-disclaimer{grid-column:1/-1;margin:0}
  }
</style>
