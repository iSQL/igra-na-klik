import { useEffect, useRef, useState } from 'react';
import type { BitkaMapView as BitkaMapData, BitkaPlayerView, BitkaTerritoryState } from '@igra/shared';
import { BitkaBoardScene } from './BitkaBoardScene';
import { planFxTiming, type BitkaFxEvent } from '@igra/shared';

interface BitkaBoard3DProps {
  map: BitkaMapData;
  board: BitkaTerritoryState[];
  players: BitkaPlayerView[];
  focusId?: string | null;
  highlightIds?: string[];
  activePlayerId?: string | null;
  events: BitkaFxEvent[];
  /** Visina platna; '100%' kad raspored sam daje visinu. */
  heightCss?: string;
  /** Gledalac traži manje pokreta — scena gasi puls i primicanje kamere. */
  reducedMotion?: boolean;
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
  activePlayerId,
  events,
  heightCss = '62vh',
  reducedMotion = false,
  onFail,
}: BitkaBoard3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BitkaBoardScene | null>(null);
  const playedRef = useRef(0);
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
      // Odnos stranica slike scena čita sama iz nje — platnu više ne treba.
      scene.setMapImage(image);
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
    sceneRef.current?.setReducedMotion(reducedMotion);
  }, [ready, reducedMotion]);

  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.update({ board, players, focusId, highlightIds, activePlayerId });
  }, [ready, board, players, focusId, highlightIds, activePlayerId]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const fresh = events.filter((ev) => ev.id > playedRef.current);
    if (!fresh.length) return;
    playedRef.current = fresh[fresh.length - 1].id;
    for (const { event, delay } of planFxTiming(fresh)) scene.playFx(event, delay);
  }, [events]);

  // Platno NIJE zaključano na odnos stranica slike kao ravna mapa: kamera sama
  // uklapa tablu u bilo kakav kadar, pa zaključavanje samo ostavlja prazne
  // pojaseve sa strane. Zauzima ceo prostor koji mu raspored da.
  return (
    <div style={{ position: 'relative', width: '100%', height: heightCss, minHeight: 0 }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
