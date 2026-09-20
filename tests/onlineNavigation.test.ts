import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

describe('online persistent navigation', () => {
  it('mounts a non-visual runtime above every online child route', async () => {
    const [layout, runtime] = await Promise.all([
      source('src/routes/online/+layout.svelte'),
      source('src/lib/components/online/OnlineRuntime.svelte')
    ]);

    expect(layout).toContain('<OnlineRuntime />');
    expect(layout).toContain('<slot />');
    expect(runtime).not.toMatch(/<(div|main|section|nav|p|span|button)[\s>]/);
  });

  it('does not tie queue or room cleanup to the play route destructor', async () => {
    const page = await source('src/routes/online/+page.svelte');
    const destroyBody = page.match(/onDestroy\(\(\) => \{([\s\S]*?)\n  \}\);/)?.[1] ?? '';

    expect(destroyBody).not.toContain('leaveQueue');
    expect(destroyBody).not.toContain('.stop()');
    expect(page).toContain('onlineSession.connectRoom');
    expect(page).toContain('onlineSession.joinQueue');
  });
});
