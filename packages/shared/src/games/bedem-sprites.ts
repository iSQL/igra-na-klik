// Flat vector art for Bedem: five enemies and four towers, keyed by their
// BedemEnemyType / BedemTowerType. 64x64 viewBox, flat fills only, so they
// stay crisp on the TV and cost a few hundred bytes each. The board rasterizes
// them into its sprite cache; the emoji in bedem-rules.ts remain the fallback
// while an image is still decoding.

const svg = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;

export const BEDEM_SPRITES: Record<string, string> = {
  // Wolf: grey head, pale muzzle, slanted amber eyes.
  vuk: svg(
    '<path d="M8 6l16 13h16L56 6l2 25c0 15-11 25-26 25S6 46 6 31z" fill="#8C98A8"/>' +
      '<path d="M10 11l9 8-7 4zM54 11l-9 8 7 4z" fill="#5C6676"/>' +
      '<path d="M20 39h24l-5 16H25z" fill="#DDE3EA"/>' +
      '<path d="M26 40h12l-6 7z" fill="#22262D"/>' +
      '<path d="M14 28l12 4-2 6-10-3zM50 28l-12 4 2 6 10-3z" fill="#FFC93C"/>' +
      '<circle cx="23" cy="34" r="2" fill="#22262D"/><circle cx="41" cy="34" r="2" fill="#22262D"/>' +
      '<path d="M28 51l4 3 4-3" fill="none" stroke="#22262D" stroke-width="2" stroke-linecap="round"/>',
  ),

  // Walker: green undead, stitched forehead, ragged mouth.
  pesak: svg(
    '<rect x="9" y="8" width="46" height="50" rx="20" fill="#8FB573"/>' +
      '<path d="M9 26c4-14 14-18 23-18s19 4 23 18c-8-5-14-6-23-6s-15 1-23 6z" fill="#4E6B3C"/>' +
      '<circle cx="23" cy="34" r="7" fill="#F4F1DE"/><circle cx="41" cy="31" r="5" fill="#F4F1DE"/>' +
      '<circle cx="24" cy="35" r="3" fill="#2B2F24"/><circle cx="40" cy="32" r="2.4" fill="#2B2F24"/>' +
      '<path d="M18 48l5-4 5 4 5-4 5 4 5-4 4 4" fill="none" stroke="#2B2F24" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<path d="M44 14l6 8M50 14l-6 8" stroke="#2B2F24" stroke-width="2" stroke-linecap="round"/>',
  ),

  // Armoured: steel helm, dark visor slit, red plume.
  oklopnik: svg(
    '<path d="M32 2c8 0 14 5 15 12l-3 3H20l-3-3c1-7 7-12 15-12z" fill="#C0392B"/>' +
      '<path d="M12 22c0-9 9-15 20-15s20 6 20 15v26c0 6-6 10-20 10S12 54 12 48z" fill="#9AA3AE"/>' +
      '<path d="M12 22c0-9 9-15 20-15v51c-14 0-20-4-20-10z" fill="#B8C0CA"/>' +
      '<rect x="16" y="26" width="32" height="8" rx="3" fill="#2A2F38"/>' +
      '<path d="M32 34v22" stroke="#6F7885" stroke-width="3"/>' +
      '<circle cx="20" cy="46" r="2" fill="#6F7885"/><circle cx="44" cy="46" r="2" fill="#6F7885"/>',
  ),

  // Swarm: purple bat, spread wings, tiny fangs.
  roj: svg(
    '<path d="M32 22C26 12 14 10 2 16c4 4 4 10 3 16 4-3 8-3 12 0 2-4 5-6 9-6z" fill="#6B5A8E"/>' +
      '<path d="M32 22c6-10 18-12 30-6-4 4-4 10-3 16-4-3-8-3-12 0-2-4-5-6-9-6z" fill="#6B5A8E"/>' +
      '<path d="M5 32c4-3 8-3 12 0M59 32c-4-3-8-3-12 0" fill="none" stroke="#4A3C69" stroke-width="2"/>' +
      '<ellipse cx="32" cy="38" rx="11" ry="15" fill="#3E3157"/>' +
      '<path d="M23 18l3 9h-7zM41 18l-3 9h7z" fill="#3E3157"/>' +
      '<circle cx="27" cy="34" r="3.2" fill="#FF6B6B"/><circle cx="37" cy="34" r="3.2" fill="#FF6B6B"/>' +
      '<path d="M28 44l1.5 5 1.5-5zM33 44l1.5 5 1.5-5z" fill="#F5EBE0"/>',
  ),

  // Dragon (boss): red head, horns, spiked brow, glowing eyes.
  azdaja: svg(
    '<path d="M10 4c2 8 6 12 12 14L16 8zM54 4c-2 8-6 12-12 14l6-10z" fill="#F0D9A8"/>' +
      '<path d="M6 30c0-12 11-20 26-20s26 8 26 20c0 8-4 12-8 14v8H14v-8c-4-2-8-6-8-14z" fill="#B5473A"/>' +
      '<path d="M22 12l4 7 6-8 6 8 4-7" fill="none" stroke="#7E2A22" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M10 28l16 5-3 6-12-3zM54 28l-16 5 3 6 12-3z" fill="#FFD23F"/>' +
      '<rect x="22" y="31" width="3" height="7" rx="1.5" fill="#2A1210"/><rect x="39" y="31" width="3" height="7" rx="1.5" fill="#2A1210"/>' +
      '<ellipse cx="32" cy="46" rx="14" ry="9" fill="#D96A58"/>' +
      '<circle cx="26" cy="45" r="2.4" fill="#7E2A22"/><circle cx="38" cy="45" r="2.4" fill="#7E2A22"/>' +
      '<path d="M24 53l3 5 3-5zM34 53l3 5 3-5z" fill="#F5EBE0"/>',
  ),

  // Archer tower: bow with a nocked arrow.
  strelac: svg(
    '<path d="M18 6c22 6 34 20 34 26S40 52 18 58" fill="none" stroke="#8B5A2B" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M18 6L18 58" stroke="#F5EBE0" stroke-width="2"/>' +
      '<path d="M10 32h46" stroke="#E3C27A" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M60 32l-12-7v14z" fill="#C8CED6"/>' +
      '<path d="M10 32l-5-5M10 32l-5 5M16 32l-5-5M16 32l-5 5" stroke="#C0392B" stroke-width="3" stroke-linecap="round"/>',
  ),

  // Catapult: wooden frame, throwing arm, loaded boulder.
  katapult: svg(
    '<circle cx="16" cy="52" r="8" fill="#5A3D22"/><circle cx="48" cy="52" r="8" fill="#5A3D22"/>' +
      '<circle cx="16" cy="52" r="3" fill="#C9A66B"/><circle cx="48" cy="52" r="3" fill="#C9A66B"/>' +
      '<path d="M8 46h48v6H8z" fill="#8B5A2B"/>' +
      '<path d="M20 46l12-22 12 22z" fill="#A9743A"/>' +
      '<path d="M16 14l32 22" stroke="#6E4520" stroke-width="6" stroke-linecap="round"/>' +
      '<circle cx="14" cy="12" r="9" fill="#8A7360"/><circle cx="11" cy="9" r="3" fill="#A8947F"/>' +
      '<circle cx="32" cy="26" r="4" fill="#E3C27A"/>',
  ),

  // Frost tower: six-armed crystal snowflake.
  led: svg(
    '<circle cx="32" cy="32" r="28" fill="#2F5D8A"/>' +
      '<g stroke="#CFEFFF" stroke-width="5" stroke-linecap="round" fill="none">' +
      '<path d="M32 10v44M13 21l38 22M13 43l38-22"/>' +
      '<path d="M26 14l6 6 6-6M26 50l6-6 6 6M10 28l8 3-3 8M54 36l-8-3 3-8M10 36l8-3-3-8M54 28l-8 3 3 8"/>' +
      '</g><circle cx="32" cy="32" r="5" fill="#fff"/>',
  ),

  // Lightning tower: gold bolt on a violet orb.
  munja: svg(
    '<circle cx="32" cy="32" r="28" fill="#4B3A7A"/>' +
      '<path d="M37 4L14 36h14l-5 24 27-34H35z" fill="#FFD23F"/>' +
      '<path d="M37 4L24 24l11 2z" fill="#FFF0A8"/>',
  ),
};
