export function buildRunImageFilename(identifier: string, prefix = 'cs13a0-run') {
  const safeIdentifier = identifier.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'result';
  return `${prefix}-${safeIdentifier}.png`;
}

export async function downloadRunImage(nodeId: string, identifier: string, prefix = 'cs13a0-run') {
  const node = document.getElementById(nodeId);
  if (!node) throw new Error('Share card not found');

  const { toPng } = await import('html-to-image');
  const captureHost = document.createElement('div');
  const captureNode = node.cloneNode(true) as HTMLElement;

  captureHost.setAttribute('aria-hidden', 'true');
  Object.assign(captureHost.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '540px',
    height: '675px',
    overflow: 'hidden',
    pointerEvents: 'none',
    background: '#050708'
  });
  captureNode.removeAttribute('id');
  Object.assign(captureNode.style, {
    boxSizing: 'border-box',
    width: '540px',
    minWidth: '540px',
    maxWidth: '540px',
    height: '675px',
    minHeight: '675px',
    margin: '0',
    transform: 'none'
  });
  captureHost.append(captureNode);
  document.body.append(captureHost);

  let dataUrl: string;
  try {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    dataUrl = await toPng(captureNode, {
      cacheBust: true,
      pixelRatio: 2,
      width: 540,
      height: 675,
      backgroundColor: '#050708',
      style: {
        width: '540px',
        minWidth: '540px',
        maxWidth: '540px',
        height: '675px',
        minHeight: '675px',
        margin: '0',
        transform: 'none'
      }
    });
  } finally {
    captureHost.remove();
  }

  const link = document.createElement('a');
  link.download = buildRunImageFilename(identifier, prefix);
  link.href = dataUrl;
  link.click();
}
