import type { MapId } from '../types';

/**
 * Arte dos mapas: miniaturas 640×360 em `static/maps/<id>.webp`, geradas a partir das imagens do dono em 2026-10-06
 * (`magick … -resize 640x360^ -extent 640x360 -quality 80`). Módulo puro, sem imports de dados: pode ser usado nos
 * componentes compartilhados com `/online`. Mapa sem arte devolve null e a tela fica como era.
 */
const MAP_ART: ReadonlySet<string> = new Set(['ancient', 'anubis', 'cache', 'cobblestone', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'vertigo']);

export function mapImageSrc(mapId: MapId | string | null | undefined): string | null {
  return mapId && MAP_ART.has(mapId) ? `/maps/${mapId}.webp` : null;
}
