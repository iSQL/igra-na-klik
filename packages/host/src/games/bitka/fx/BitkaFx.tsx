import { useEffect, useRef } from 'react';
import { BitkaFxScene } from './BitkaFxScene';
import { planFxTiming, type BitkaFxEvent } from '@igra/shared';

/**
 * React omotač oko FX scene. Sav three.js je iza ovog modula, koji se učitava
 * lenjo (`lazy`) — mapa se iscrta odmah, a efekti se priključe kad chunk stigne.
 *
 * Platno se apsolutno poklapa sa kutijom mape, pa normalizovane koordinate
 * [0,1] iz `BitkaFxEvent` padaju tačno na teritorije ispod.
 */
export default function BitkaFx({ events }: { events: BitkaFxEvent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<BitkaFxScene | null>(null);
  /** Do kog id-ja je odigrano — isti niz stiže i na re-render bez novosti. */
  const playedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;

    const scene = new BitkaFxScene(canvas);
    sceneRef.current = scene;
    scene.resize(box.clientWidth, box.clientHeight);

    const observer = new ResizeObserver(() => scene.resize(box.clientWidth, box.clientHeight));
    observer.observe(box);

    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Udar se kasni tačno onoliko koliko projektil leti — ako je u istoj
    // grupi bilo napada.
    const fresh = events.filter((ev) => ev.id > playedRef.current);
    if (!fresh.length) return;
    playedRef.current = fresh[fresh.length - 1].id;
    for (const { event, delay } of planFxTiming(fresh)) scene.play(event, delay);
  }, [events]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
