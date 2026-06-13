export async function downloadRunImage(nodeId: string, seed: string) {
  const node = document.getElementById(nodeId);
  if (!node) throw new Error('Share card not found');

  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    width: 540,
    height: 675,
    backgroundColor: '#050708',
    style: {
      width: '540px',
      maxWidth: 'none',
      height: '675px'
    }
  });

  const link = document.createElement('a');
  link.download = `cs20a0-run-${seed}.png`;
  link.href = dataUrl;
  link.click();
}
