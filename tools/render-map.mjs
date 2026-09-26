// Renders a Graphviz concept map to the SVG the Concept Map tab shows.
//   node tools/render-map.mjs public/lectures/<id>/map.dot     → writes map.svg beside it
// Uses @viz-js/viz (Graphviz compiled to WebAssembly) so no system install is needed.
// Start from tools/reference/map-template.dot to match the existing maps' look.
import { readFileSync, writeFileSync } from 'node:fs';
import { instance } from '@viz-js/viz';

const dot = process.argv[2];
if (!dot?.endsWith('.dot')) { console.error('usage: node tools/render-map.mjs <map.dot>'); process.exit(1); }
const viz = await instance();
let svg = viz.renderString(readFileSync(dot, 'utf8'), { format: 'svg', engine: 'dot' });
svg = svg.replace(/^[\s\S]*?(<svg\b)/, '$1').replace(/<svg\b(?![^>]*\bid=)/, '<svg id="cmap"');
const out = dot.replace(/\.dot$/, '.svg');
writeFileSync(out, svg.trim() + '\n');
console.log(`${out} (${(svg.match(/class="node"/g) || []).length} nodes)`);
