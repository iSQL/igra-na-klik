import { useEffect, useRef, type CSSProperties } from 'react';
import type { PotegniHostData, PotegniIgrac, PotegniPotez, PotegniTim } from '@igra/shared';
import { POTEGNI_BOT_LABEL, potegniOpis, potegniUdeo } from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { useSound } from '../../hooks/useSound';
import { socket } from '../../socket';

const TIM_BOJA: Record<PotegniTim, string> = { crveni: '#C75146', plavi: '#4F80B8' };
const TIM_IME: Record<PotegniTim, string> = { crveni: 'Crveni', plavi: 'Plavi' };
const OK = 'var(--success-ink)';
const BAD = 'var(--danger)';
const SPRING = 'cubic-bezier(.34,1.56,.64,1)';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const igraca = (n: number) => (n === 1 ? '1 igrač' : `${n} igrača`);
const netacnih = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? `${n} netačan` : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} netačna` : `${n} netačnih`);
const tacnih = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? `${n} tačan` : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? `${n} tačna` : `${n} tačnih`);

export default function PovuciPotegniHost() {
  const gameState = useGameStore((s) => s.gameState);
  const { play } = useSound();
  const prevPhase = useRef<string | null>(null);
  const prevPotez = useRef<number>(0);

  const host = gameState?.data.host as PotegniHostData | undefined;
  const phase = gameState?.phase;

  useEffect(() => {
    if (!phase || phase === prevPhase.current) return;
    prevPhase.current = phase;
    if (phase === 'vuca') play('tick');
    if (phase === 'kraj') play('victory');
  }, [phase, play]);

  // Tihi klik po potezu — svaki tačan na TV-u se čuje, promašaj dublje.
  const zadnji = host?.potezi[0];
  useEffect(() => {
    if (!zadnji || zadnji.id === prevPotez.current) return;
    const prvi = prevPotez.current === 0;
    prevPotez.current = zadnji.id;
    if (!prvi && phase === 'vuca' && zadnji.playerId !== 'bot') play(zadnji.ok ? 'correct' : 'wrong');
  }, [zadnji, phase, play]);

  if (!gameState || !host) return null;
  const { timeRemaining } = gameState;

  if (phase === 'kraj' || phase === 'ended') return <Kraj host={host} />;

  const solo = host.mode === 'solo';
  const clan = (t: PotegniTim) => host.igraci.filter((i) => i.tim === t);
  const velicina = (t: PotegniTim) => Math.max(1, clan(t).filter((p) => p.connected).length);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: '72px 48px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24 }}>
        <TimZaglavlje
          tim="crveni"
          ime={solo ? (host.igraci.length > 1 ? 'Vi' : host.igraci[0]?.name ?? 'Ti') : 'Crveni'}
          tacno={host.tacno.crveni}
          opis={`${igraca(clan('crveni').length)}`}
          detalj={`korak ${potegniUdeo(velicina('crveni'))} · ${netacnih(host.netacno.crveni)}`}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          {phase === 'vuca' ? (
            <span
              className="display"
              style={{
                fontWeight: 800,
                fontSize: '3.4rem',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: timeRemaining <= 10 ? 'var(--danger)' : 'var(--text-primary)',
              }}
            >
              {clock(timeRemaining)}
            </span>
          ) : (
            <span className="display" style={{ fontWeight: 800, fontSize: '2.2rem', lineHeight: 1 }}>
              🪢 Povuci-potegni
            </span>
          )}
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {potegniOpis(host.predmeti, host.tezina)}
          </span>
        </div>
        <TimZaglavlje
          tim="plavi"
          desno
          ime={solo ? `🤖 Bot · ${POTEGNI_BOT_LABEL[host.bot ?? 'srednji']}` : 'Plavi'}
          tacno={host.tacno.plavi}
          opis={solo ? 'vuče sam' : igraca(clan('plavi').length)}
          detalj={solo ? `${host.botPoteza ?? 0} poteza` : `korak ${potegniUdeo(velicina('plavi'))} · ${netacnih(host.netacno.plavi)}`}
        />
      </div>

      <Arena host={host} />

      {phase === 'timovi' && <IzborTimova host={host} timeRemaining={timeRemaining} />}
      {phase === 'spremni' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(11,22,40,.55)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
              Zadaci stižu na telefone…
            </span>
            <span
              key={timeRemaining}
              className="display"
              style={{ fontSize: '9rem', fontWeight: 800, lineHeight: 1, animation: 'igra-pop .4s' }}
            >
              {Math.max(1, timeRemaining)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function TimZaglavlje({
  tim,
  ime,
  tacno,
  opis,
  detalj,
  desno,
}: {
  tim: PotegniTim;
  ime: string;
  tacno: number;
  opis: string;
  detalj: string;
  desno?: boolean;
}) {
  const chip = (
    <div
      style={{
        padding: '.6rem 1.1rem',
        borderRadius: '.7rem',
        background: TIM_BOJA[tim],
        color: '#fff',
        fontWeight: 700,
        minWidth: 130,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
        {ime}
      </div>
      <div className="display" style={{ fontSize: '1.9rem', lineHeight: 1 }}>
        {tacno} ✓
      </div>
    </div>
  );
  const info = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: desno ? 'right' : 'left' }}>
      <span style={{ fontWeight: 800, fontSize: '.95rem' }}>{opis}</span>
      <span style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{detalj}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: desno ? 'flex-end' : 'flex-start' }}>
      {desno ? info : chip}
      {desno ? chip : info}
    </div>
  );
}

// --- Arena (1a) -------------------------------------------------------------------

function Arena({ host }: { host: PotegniHostData }) {
  const solo = host.mode === 'solo';
  const blok = new Set(host.blokirani);
  const knot = 50 - host.pozicija * 0.2;
  const pomak = host.pozicija * 0.08;
  const clan = (t: PotegniTim) => host.igraci.filter((i) => i.tim === t);
  const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s });
  const label: CSSProperties = { fontSize: '.75rem', fontWeight: 800, letterSpacing: '.1em' };
  // Čvor blizu crte — konopac se zategne i zasija.
  const blizu = Math.abs(host.pozicija) >= 75;

  const red = (lista: PotegniIgrac[], side: 'left' | 'right') => (
    <div
      style={abs({
        [side]: `${5 + (side === 'left' ? -pomak : pomak)}%`,
        width: '24%',
        top: 'calc(42% - 36px)',
        display: 'flex',
        justifyContent: 'space-around',
        transition: `${side} .6s ${SPRING}`,
      })}
    >
      {lista.map((p) => (
        <span
          key={p.playerId}
          title={p.name}
          style={{
            width: 48,
            height: 48,
            borderRadius: '30%',
            background: p.avatarColor,
            display: 'grid',
            placeItems: 'center',
            fontSize: '1.6rem',
            transform: `rotate(${side === 'left' ? -8 : 8}deg)`,
            opacity: blok.has(p.playerId) || !p.connected ? 0.45 : 1,
            transition: 'opacity .25s',
          }}
        >
          {p.avatarEmoji}
        </span>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
      <div
        style={abs({
          left: 0,
          bottom: 0,
          width: '30%',
          height: '58%',
          background: 'var(--bg-card)',
          borderTopRightRadius: 36,
          borderTop: '3px solid rgba(199,81,70,.7)',
        })}
      />
      <div
        style={abs({
          right: 0,
          bottom: 0,
          width: '30%',
          height: '58%',
          background: 'var(--bg-card)',
          borderTopLeftRadius: 36,
          borderTop: '3px solid rgba(79,128,184,.7)',
        })}
      />
      <div
        style={abs({
          left: '30%',
          right: '30%',
          bottom: 0,
          height: '17%',
          background: 'linear-gradient(180deg, rgba(111,194,187,.32), rgba(111,194,187,.08))',
          borderTop: '2px solid rgba(111,194,187,.6)',
        })}
      />
      <div style={abs({ left: '50%', top: '6%', bottom: '17%', borderLeft: '2px dashed var(--line2)' })} />
      <span style={abs({ ...label, left: '50%', top: 0, transform: 'translateX(-50%)', color: 'var(--dim)' })}>
        SREDINA
      </span>
      <div style={abs({ left: '30%', top: '22%', height: '20%', borderLeft: `3px solid ${TIM_BOJA.crveni}` })} />
      <span style={abs({ ...label, left: '30%', top: '16%', transform: 'translateX(-50%)', color: TIM_BOJA.crveni })}>
        CRTA
      </span>
      <div style={abs({ left: '70%', top: '22%', height: '20%', borderLeft: `3px solid ${TIM_BOJA.plavi}` })} />
      <span style={abs({ ...label, left: '70%', top: '16%', transform: 'translateX(-50%)', color: TIM_BOJA.plavi })}>
        CRTA
      </span>
      <div
        style={abs({
          left: '4%',
          right: '4%',
          top: 'calc(42% - 4px)',
          height: 8,
          borderRadius: 4,
          background: 'repeating-linear-gradient(115deg,#c29b47 0 8px,#8f6e2c 8px 12px)',
          boxShadow: blizu ? '0 0 16px rgba(227,180,94,.6)' : '0 3px 8px rgba(0,0,0,.35)',
          transition: 'box-shadow .4s',
        })}
      />
      <div
        style={abs({
          top: '42%',
          left: `${knot}%`,
          transform: 'translate(-50%,-50%)',
          transition: `left .6s ${SPRING}`,
        })}
      >
        <span
          style={{
            display: 'block',
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: 'var(--amber)',
            border: '4px solid var(--text-primary)',
            boxShadow: '0 0 0 8px rgba(227,180,94,.18), 0 0 30px rgba(227,180,94,.5)',
          }}
        />
      </div>
      {solo ? (
        <>
          {red(clan('crveni'), 'left')}
          <span
            style={abs({
              right: `${12 + pomak}%`,
              top: 'calc(42% - 40px)',
              width: 56,
              height: 56,
              borderRadius: '30%',
              background: TIM_BOJA.plavi,
              display: 'grid',
              placeItems: 'center',
              fontSize: '1.9rem',
              transform: 'rotate(8deg)',
              transition: `right .6s ${SPRING}`,
            })}
          >
            🤖
          </span>
        </>
      ) : (
        <>
          {red(clan('crveni'), 'left')}
          {red(clan('plavi'), 'right')}
        </>
      )}
      <Traka host={host} tim="crveni" side="left" />
      <Traka host={host} tim="plavi" side="right" />
    </div>
  );
}

/** Poslednja tri poteza tima, najnoviji gore i najjasniji. */
function Traka({ host, tim, side }: { host: PotegniHostData; tim: PotegniTim; side: 'left' | 'right' }) {
  const potezi = host.potezi.filter((p) => p.tim === tim).slice(0, 3);
  const igrac = (id: string) => host.igraci.find((i) => i.playerId === id);
  return (
    <div
      style={{
        position: 'absolute',
        [side]: '3%',
        width: '26%',
        top: 'calc(42% + 40px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {potezi.map((p, i) => (
        <PotezRed key={p.id} potez={p} igrac={igrac(p.playerId)} opacity={[1, 0.75, 0.5][i]} />
      ))}
    </div>
  );
}

function PotezRed({ potez, igrac, opacity }: { potez: PotegniPotez; igrac?: PotegniIgrac; opacity: number }) {
  const bot = potez.playerId === 'bot';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 12,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--line)',
        opacity,
        animation: opacity === 1 ? 'igra-pop .3s' : undefined,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: '30%',
          background: bot ? TIM_BOJA.plavi : igrac?.avatarColor ?? 'var(--bg-card)',
          display: 'grid',
          placeItems: 'center',
          fontSize: '.95rem',
          flexShrink: 0,
        }}
      >
        {bot ? '🤖' : igrac?.avatarEmoji ?? '?'}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bot ? 'Bot' : igrac?.name ?? '—'}
      </span>
      <span style={{ fontWeight: 800, fontSize: '.9rem', color: potez.ok ? OK : BAD }}>
        {bot ? '✓ +1' : potez.ok ? `✓ +${potegniUdeo(potez.udeo)}` : '✕ 3 s'}
      </span>
    </div>
  );
}

// --- Izbor timova (TV) ------------------------------------------------------------

function IzborTimova({ host, timeRemaining }: { host: PotegniHostData; timeRemaining: number }) {
  const holder = host.igraci.find((i) => i.playerId === host.kontrolaId);
  const nC = host.igraci.filter((i) => i.tim === 'crveni').length;
  const nP = host.igraci.length - nC;
  const btn: CSSProperties = {
    padding: '.7rem 1.4rem',
    borderRadius: 12,
    fontWeight: 800,
    fontSize: '1.05rem',
    pointerEvents: 'auto',
  };
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 32,
        transform: 'translateX(-50%)',
        width: 'min(560px, 40%)',
        padding: '1rem 1.2rem',
        borderRadius: 16,
        background: 'rgba(22,46,78,.92)',
        border: '1px solid var(--line2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        textAlign: 'center',
      }}
    >
      <span className="display" style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.1 }}>
        Izaberite stranu konopca na telefonu
      </span>
      <span style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
        {nC} na {nP} · {holder ? `pokreće ${holder.name}` : 'pokrenite odavde'} · sama kreće za {clock(timeRemaining)}
      </span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => socket.emit('host:game-action', { action: 'potegni:pomiri' })}
          disabled={Math.abs(nC - nP) <= 1}
          style={{
            ...btn,
            background: 'transparent',
            border: '1.5px solid var(--line2)',
            color: 'var(--text-primary)',
            opacity: Math.abs(nC - nP) <= 1 ? 0.45 : 1,
          }}
        >
          Pomiri timove
        </button>
        <button
          onClick={() => socket.emit('host:game-action', { action: 'potegni:pocni' })}
          style={{ ...btn, background: 'var(--accent)', color: '#162e4e', boxShadow: 'var(--shadow-cta)' }}
        >
          Počni igru ▸
        </button>
      </div>
    </div>
  );
}

// --- Kraj (1b) ----------------------------------------------------------------------

function Kraj({ host }: { host: PotegniHostData }) {
  const ishod = host.ishod;
  const solo = host.mode === 'solo';
  const pob = ishod?.pobednik ?? null;
  const naslov =
    pob === null ? '🤝 NEREŠENO' : solo ? (pob === 'crveni' ? '🏆 POBEDA' : '🤖 BOT JE JAČI') : `🏆 ${TIM_IME[pob].toUpperCase()} TIM`;
  const razlog = !ishod
    ? ''
    : pob === null
      ? 'Čvor je ostao na sredini kad je isteklo vreme.'
      : ishod.razlog === 'crta'
        ? `${solo && pob === 'plavi' ? 'Bot je dovukao' : 'Dovukli su'} čvor do svoje crte, ${clock(ishod.preostalo)} pre kraja.`
        : `Kad je isteklo vreme, čvor je bio bliže ${pob === 'crveni' ? (solo ? 'vama' : 'crvenima') : solo ? 'botu' : 'plavima'}.`;
  const timovi: PotegniTim[] = solo ? ['crveni'] : ['crveni', 'plavi'];

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: '72px 72px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      <div
        style={{
          padding: '1.8rem',
          borderRadius: '.9rem',
          background: pob ? TIM_BOJA[pob] : 'var(--bg-card)',
          color: '#fff',
          textAlign: 'center',
          animation: 'igra-pop .4s',
        }}
      >
        <p style={{ fontSize: '1.3rem', opacity: 0.85, fontWeight: 700, margin: 0 }}>
          {pob === null ? 'KRAJ' : solo && pob === 'plavi' ? 'PORAZ' : 'POBEDA'}
        </p>
        <p className="display" style={{ fontSize: '4rem', fontWeight: 800, letterSpacing: '.04em', lineHeight: 1.05, margin: 0 }}>
          {naslov}
        </p>
        <p style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{razlog}</p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: timovi.length === 2 ? '1fr 1fr' : 'minmax(0, 720px)',
          justifyContent: 'center',
          gap: 24,
          flex: 1,
          minHeight: 0,
        }}
      >
        {timovi.map((t) => (
          <div
            key={t}
            style={{
              background: 'var(--bg-card)',
              borderTop: `4px solid ${TIM_BOJA[t]}`,
              borderRadius: '.7rem',
              padding: '1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '.5rem',
              overflow: 'hidden',
            }}
          >
            <p style={{ fontWeight: 800, color: TIM_BOJA[t], fontSize: '1.15rem', margin: 0 }}>
              {solo ? 'Vaš tim' : `${TIM_IME[t]} tim`} · {tacnih(host.tacno[t])} · {netacnih(host.netacno[t])}
            </p>
            {(host.statistika ?? [])
              .filter((s) => s.tim === t)
              .map((s) => {
                const p = host.igraci.find((i) => i.playerId === s.playerId);
                return (
                  <div
                    key={s.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.7rem',
                      padding: '.5rem .75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '.5rem',
                      borderLeft: `3px solid ${p?.avatarColor ?? 'var(--line2)'}`,
                    }}
                  >
                    <span style={{ fontSize: '1.3rem' }}>{p?.avatarEmoji}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: '1.05rem' }}>{p?.name ?? '—'}</span>
                    {s.oznaka && (
                      <span style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--accent)' }}>
                        {s.oznaka === 'munja' ? '⚡ MUNJA' : 'BEZ GREŠKE'}
                      </span>
                    )}
                    <span style={{ fontWeight: 800, color: OK, minWidth: '3ch', textAlign: 'right' }}>{s.tacno} ✓</span>
                    <span style={{ fontWeight: 800, color: BAD, minWidth: '3ch', textAlign: 'right' }}>{s.netacno} ✕</span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
