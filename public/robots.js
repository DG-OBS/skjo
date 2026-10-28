// Générateur de robots en SVG : 10 modèles, tous plus beaux les uns que les autres.
const Robots = (() => {
  const COLORS = ['#4fd1ff', '#ff7a45', '#a3e635', '#f472b6', '#facc15', '#a78bfa', '#34d399', '#f87171', '#60a5fa', '#fb923c'];
  const NAMES = ['Boulon', 'Clank', 'Turbo-Grille-Pain', 'Bip-Bip', 'Écrou-Man', 'Rouillette', 'Chaussette-Tron', 'Vis-Sans-Fin', 'Pixel', 'Giga-Watt'];
  const DESIGNS = [
    { head: 0, eyes: 0, ant: 0, mouth: 0 },
    { head: 1, eyes: 1, ant: 1, mouth: 1 },
    { head: 2, eyes: 2, ant: 2, mouth: 2 },
    { head: 3, eyes: 3, ant: 3, mouth: 3 },
    { head: 4, eyes: 4, ant: 4, mouth: 4 },
    { head: 1, eyes: 2, ant: 0, mouth: 2 },
    { head: 0, eyes: 1, ant: 2, mouth: 0 },
    { head: 3, eyes: 0, ant: 1, mouth: 4 },
    { head: 2, eyes: 3, ant: 3, mouth: 1 },
    { head: 4, eyes: 1, ant: 0, mouth: 3 },
  ];
  const METAL = '#9aa5c4';
  const DARK = '#141a2e';

  function antenna(kind, color) {
    switch (kind) {
      case 0: return `<line x1="50" y1="26" x2="50" y2="10" stroke="${METAL}" stroke-width="3"/><circle class="led" cx="50" cy="8" r="5" fill="#ff4d6d"/>`;
      case 1: return `<line x1="40" y1="26" x2="32" y2="8" stroke="${METAL}" stroke-width="3"/><line x1="60" y1="26" x2="68" y2="8" stroke="${METAL}" stroke-width="3"/>
        <circle class="led" cx="32" cy="7" r="4" fill="#5ef2ff"/><circle class="led led2" cx="68" cy="7" r="4" fill="#5ef2ff"/>`;
      case 2: return `<line x1="50" y1="26" x2="50" y2="12" stroke="${METAL}" stroke-width="3"/>
        <g class="prop"><ellipse cx="50" cy="10" rx="17" ry="3.5" fill="${color}" stroke="${DARK}" stroke-width="2"/></g><circle cx="50" cy="10" r="3" fill="${DARK}"/>`;
      case 3: return `<polygon class="led" points="54,2 42,16 50,16 44,28 60,12 52,12 58,2" fill="#ffe066" stroke="${DARK}" stroke-width="1.5"/>`;
      default: return `<polygon points="50,8 58,12 58,21 50,25 42,21 42,12" fill="${METAL}" stroke="${DARK}" stroke-width="2"/><circle cx="50" cy="16.5" r="3.5" fill="${DARK}"/>`;
    }
  }

  function head(kind, color) {
    const s = `fill="${color}" stroke="${DARK}" stroke-width="3"`;
    switch (kind) {
      case 0: return `<rect x="16" y="22" width="68" height="58" rx="14" ${s}/>`;
      case 1: return `<circle cx="50" cy="52" r="33" ${s}/>`;
      case 2: return `<polygon points="24,22 76,22 87,80 13,80" stroke-linejoin="round" ${s}/>`;
      case 3: return `<rect x="20" y="18" width="60" height="64" rx="6" ${s}/><rect x="20" y="18" width="60" height="9" fill="${DARK}" opacity=".25"/>`;
      default: return `<polygon points="50,18 85,33 85,71 50,86 15,71 15,33" stroke-linejoin="round" ${s}/>`;
    }
  }

  function eyes(kind) {
    switch (kind) {
      case 0: return `<g class="eyes"><circle cx="40" cy="50" r="7" fill="#5ef2ff"/><circle cx="60" cy="50" r="7" fill="#5ef2ff"/>
        <circle class="pupil" cx="41" cy="51" r="3" fill="${DARK}"/><circle class="pupil" cx="61" cy="51" r="3" fill="${DARK}"/></g>`;
      case 1: return `<g class="eyes"><rect x="30" y="45" width="40" height="10" rx="5" fill="#3b0d1a"/><rect class="scan" x="31" y="46" width="12" height="8" rx="4" fill="#ff3b5c"/></g>`;
      case 2: return `<g class="eyes"><circle cx="50" cy="50" r="10" fill="#ffe066"/><circle class="pupil" cx="50" cy="51" r="4.5" fill="${DARK}"/><circle cx="53" cy="47" r="1.6" fill="#fff"/></g>`;
      case 3: return `<g class="eyes"><rect x="32" y="44" width="13" height="13" rx="2" fill="#7cff6b"/><rect x="55" y="44" width="13" height="13" rx="2" fill="#7cff6b"/>
        <rect x="36" y="48" width="5" height="5" fill="${DARK}"/><rect x="59" y="48" width="5" height="5" fill="${DARK}"/></g>`;
      default: return `<g class="eyes"><circle cx="40" cy="51" r="6" fill="#ff9f43"/><circle cx="60" cy="51" r="6" fill="#ff9f43"/>
        <circle cx="40" cy="52" r="2.5" fill="${DARK}"/><circle cx="60" cy="52" r="2.5" fill="${DARK}"/></g>
        <line x1="32" y1="41" x2="46" y2="45" stroke="${DARK}" stroke-width="3" stroke-linecap="round"/><line x1="68" y1="41" x2="54" y2="45" stroke="${DARK}" stroke-width="3" stroke-linecap="round"/>`;
    }
  }

  function mouth(kind) {
    const st = 'stroke="#c8d3f5" stroke-width="2.5" fill="none" stroke-linecap="round"';
    switch (kind) {
      case 0: return `<rect x="38" y="60" width="24" height="7" rx="2" fill="#c8d3f5"/><path d="M44 60v7M50 60v7M56 60v7" stroke="${DARK}" stroke-width="1.5"/>`;
      case 1: return `<path class="mouth" d="M38 60 Q50 70 62 60" ${st}/>`;
      case 2: return `<polyline class="mouth" points="36,63 41,59 46,63 51,59 56,63 61,59 64,62" ${st}/>`;
      case 3: return `<circle class="mouth" cx="50" cy="63" r="4" ${st}/>`;
      default: return `<line class="mouth" x1="39" y1="63" x2="61" y2="63" ${st}/>`;
    }
  }

  function svg(index) {
    const i = ((Number(index) % 10) + 10) % 10;
    const d = DESIGNS[i];
    const c = COLORS[i];
    return `<svg class="robot" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="28" y="86" width="44" height="14" rx="6" fill="${c}" stroke="${DARK}" stroke-width="2.5"/>
      <rect x="43" y="79" width="14" height="9" fill="${METAL}"/>
      ${antenna(d.ant, c)}
      <rect x="9" y="43" width="9" height="19" rx="3" fill="${METAL}" stroke="${DARK}" stroke-width="2"/>
      <rect x="82" y="43" width="9" height="19" rx="3" fill="${METAL}" stroke="${DARK}" stroke-width="2"/>
      ${head(d.head, c)}
      <rect x="26" y="36" width="48" height="36" rx="9" fill="#0f1629"/>
      ${eyes(d.eyes)}
      ${mouth(d.mouth)}
      <circle cx="22" cy="30" r="2" fill="${DARK}" opacity=".5"/><circle cx="78" cy="30" r="2" fill="${DARK}" opacity=".5"/>
    </svg>`;
  }

  return { svg, NAMES, COLORS, count: 10 };
})();
