import { useEffect, useRef, useState } from 'react';
import type { BitkaMapView as BitkaMapData, BitkaPlayerView, BitkaTerritoryState } from '@igra/shared';
import { BitkaBoardScene } from './BitkaBoardScene';
import { FX_SHOT_SECONDS, type BitkaFxEvent } from './fx-events';

interface BitkaBoard3DProps {
  map: BitkaMapData;
  board: BitkaTerritoryState[];
  players: BitkaPlayerView[];
  focusId?: string | null;
  highlightIds?: string[];
  events: BitkaFxEvent[];
  maxHeightCss?: string;
  /** WebGL nije dostupan — pozivalac se vraća na 2D mapu. */
  onFail?: () => void;
}

/**
 * React omotač oko 3D terena. Kutija je iste veličine kao 2D mapa, pa se
 * raspored TV ekrana ne menja kad se prikaz zameni.
 */
export default function BitkaBoard3D({
  map,
  board,
  players,
  focusId,
  highlightIds,
  events,
  maxHeightCss = '62vh',
  onFail,
}: BitkaBoard3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BitkaBoardScene | null>(null);
  const playedRef = useRef(0);
  const [ratio, setRatio] = useState(3 / 2);
  const [ready, setReady] = useState(false);
  // `host.map` je nov objekat na svaki tick servera, pa se scena NE sme vezati
  // za njegov identitet — teren bi se rušio i gradio jednom u sekundi. Vezuje
  // se za `map.id`, a sam objekat se čita iz ref-a.
  const mapRef = useRef(map);
  mapRef.current = map;
  const mapId = map.id;

  // Scena se pravi jednom po mapi — teren je geometrija, ne stanje partije.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const mapData = mapRef.current;

    let scene: BitkaBoardScene;
    try {
      scene = new BitkaBoardScene(canvas, mapData);
    } catch {
      // Stari TV pretraživač bez WebGL-a — nazad na 2D mapu.
      onFail?.();
      return;
    }
    sceneRef.current = scene;
    scene.resize(box.clientWidth, box.clientHeight);
    setReady(true);

    // Slika se učitava ovde, pa se iz nje čita i odnos stranica i tekstura —
    // jedno skidanje umesto dva.
    const image = new Image();
    // Tekstura mora biti CORS-čista, inače WebGL odbija da je koristi.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (sceneRef.current !== scene) return;
      scene.setMapImage(image);
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setRatio(image.naturalWidth / image.naturalHeight);
      }
    };
    // Slika koja ne stigne nije razlog za pad — teren ostaje bez crteža,
    // vlasništvo se i dalje čita po bojama.
    image.onerror = null;
    image.src = mapData.imageUrl;

    const observer = new ResizeObserver(() => scene.resize(box.clientWidth, box.clientHeight));
    observer.observe(box);

    return () => {
      observer.disconnect();
      image.onload = null;
      scene.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, [mapId, onFail]);

  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.update({ board, players, focusId, highlightIds });
  }, [ready, board, players, focusId, highlightIds]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let delay = 0;
    for (const ev of events) {
      if (ev.id <= playedRef.current) continue;
      playedRef.current = ev.id;
      if (ev.kind === 'napad') {
        scene.playFx(ev);
        delay = FX_SHOT_SECONDS;
      } else {
        scene.playFx(ev, delay);
      }
    }
  }, [events]);

  return (
    <div
      style={{
        position: 'relative',
        width: `min(100%, calc(${maxHeightCss} * ${ratio}))`,
        aspectRatio: `${ratio}`,
        margin: '0 auto',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
