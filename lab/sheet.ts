export interface SheetCard {
  readonly id: string;
  readonly svg: string;
  readonly caption: string;
}

export interface SheetGroup {
  readonly title: string;
  readonly cards: readonly SheetCard[];
  readonly fixedCellWidthPx?: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCard(card: SheetCard, fixedCellWidthPx: number | undefined): string {
  const style = fixedCellWidthPx !== undefined ? ` style="width:${fixedCellWidthPx}px"` : '';
  return `<div class="card"${style}>
    <div class="card-frame">${card.svg}</div>
    <div class="caption">${escapeHtml(card.id)} &mdash; ${escapeHtml(card.caption)}</div>
  </div>`;
}

function renderGroup(group: SheetGroup): string {
  const cardsHtml = group.cards.map((card) => renderCard(card, group.fixedCellWidthPx)).join('');
  return `<div class="group-title">${escapeHtml(group.title)}</div><div class="grid">${cardsHtml}</div>`;
}

export function renderSheet(groups: readonly SheetGroup[]): string {
  const groupsHtml = groups.map(renderGroup).join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Poster composition lab</title>
<style>
  :root { --cell-width: 240px; --blur-px: 0px; }
  * { box-sizing: border-box; }
  body { background: #000; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; }
  .toolbar { position: sticky; top: 0; background: #000; padding: 12px 0 20px; display: flex; gap: 32px; align-items: center; border-bottom: 1px solid #333; margin-bottom: 24px; z-index: 10; }
  .toolbar label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #888; display: flex; gap: 10px; align-items: center; }
  .group-title { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin: 28px 0 12px; }
  .grid { display: flex; flex-wrap: wrap; gap: 16px; }
  .card { width: var(--cell-width); }
  .card-frame { filter: blur(var(--blur-px)); background: #111; border: 1px solid #333; overflow: hidden; aspect-ratio: 1080 / 1350; }
  .card-frame svg { width: 100%; height: 100%; display: block; }
  .caption { margin-top: 6px; font-size: 10px; letter-spacing: 0.08em; color: #777; word-break: break-word; }
</style>
</head>
<body>
  <div class="toolbar">
    <label>Blur <input id="blur-slider" type="range" min="0" max="16" step="1" value="0"></label>
    <label>Cell width <input id="width-slider" type="range" min="160" max="480" step="8" value="240"></label>
  </div>
  ${groupsHtml}
  <script>
    (function () {
      var root = document.documentElement;
      var blur = document.getElementById('blur-slider');
      var width = document.getElementById('width-slider');
      blur.addEventListener('input', function () { root.style.setProperty('--blur-px', blur.value + 'px'); });
      width.addEventListener('input', function () { root.style.setProperty('--cell-width', width.value + 'px'); });
    })();
  </script>
</body>
</html>
`;
}
