import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type {
  PotegniControllerData,
  PotegniHostData,
  PotegniIgrac,
  PotegniPredmet,
  PotegniTim,
  PotegniZadatak,
} from '@igra/shared';
import {
  POTEGNI_BOT_LABEL,
  POTEGNI_PREDMET_LABEL,
  POTEGNI_TIMOVI_SEKUNDI,
  potegniOpis,
  potegniUdeo,
} from '@igra/shared';
import { useGameStore } from '../../store/gameStore';
import { usePlayerStore } from '../../store/playerStore';
import { socket } from '../../socket';
import { cue } from '../../utils/cues';
import { GameFrame } from '../../components/kit/GameFrame';
import { RoundVerdict, verdictWash } from '../../components/kit/RoundVerdict';

const TIM_BOJA: Record<PotegniTim, string> = { crveni: '#C75146', plavi: '#4F80B8' };
const TIM_IME: Record<PotegniTim, string> = { crveni: 'Crveni', plavi: 'Plavi' };
const PROTIVNIK: Record<PotegniTim, PotegniTim> = { crveni: 'plavi', plavi: 'crveni' };

const PREDMET_BOJA: Record<PotegniPredmet, [string, string]> = {
  matematika: ['rgba(227,180,94,.18)', 'var(--amber)'],
  fizika: ['rgba(109,155,209,.18)', 'var(--blue)'],
  hemija: ['rgba(169,196,108,.18)', 'var(--lime)'],
};

const TASTERI = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'];

const goldBtn: CSSProperties = {
  minHeight: 56,
  borderRadius: 16,
  background: 'var(--accent)',
  color: '#162e4e',
  fontWeight: 800,
  fontSize: '1.06rem',
  boxShadow: 'var(--shadow-cta)',
};

export default function PovuciPotegniController() {
  const gameState = useGameStore((s) => s.gameState);
  const me = usePlayerStore((s) => s.player);
  const room = usePlayerStore((s) => s.room);

  if (!gameState || !me) return null;
  const { phase, timeRemaining, data, playerData } = gameState;
  const host = data.host as PotegniHostData;
  const my = playerData[me.id] as unknown as PotegniControllerData | undefined;
  const tim: PotegniTim = my?.tim ?? host.igraci.find((i) => i.playerId === me.id)?.tim ?? 'crveni';
  const solo = host.mode === 'solo';

  let subtitle: string;
  if (phase === 'timovi') subtitle = 'Izbor timova';
  else if (solo) subtitle = `Solo · Bot: ${POTEGNI_BOT_LABEL[host.bot ?? 'srednji']}`;
  else if (my && my.niz >= 3 && phase === 'vuca') subtitle = `${TIM_IME[tim]} tim · ${my.niz} tačnih zaredom`;
  else subtitle = `${TIM_IME[tim]} tim`;

  let body: ReactNode;
  if (phase === 'timovi') {
    body = <IzborTima host={host} meId={me.id} tim={tim} canControl={room?.remoteHostPlayerId === me.id} />;
  } else if (phase === 'spremni') {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <MiniArena host={host} meId={me.id} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            textAlign: 'center',
          }}
        >
          <span style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>
            {solo ? 'Ti vučeš crveno, bot plavo' : `Vučeš za ${TIM_IME[tim].toLowerCase()} tim`}
          </span>
          <span
            key={timeRemaining}
            className="display"
            style={{ fontSize: '5rem', fontWeight: 800, lineHeight: 1, animation: 'igra-pop .35s' }}
          >
            {Math.max(1, timeRemaining)}
          </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {potegniOpis(host.predmeti, host.tezina)}
          </span>
        </div>
      </div>
    );
  } else if (phase === 'vuca') {
    body = <Vuca host={host} my={my} meId={me.id} tim={tim} />;
  } else {
    body = <Kraj host={host} my={my} tim={tim} hostless={!!room?.hostless} />;
  }

  return (
    <GameFrame
      gameId="povuci-potegni"
      subtitle={subtitle}
      timeRemaining={phase === 'vuca' || phase === 'timovi' ? timeRemaining : undefined}
      timeTotal={phase === 'vuca' ? host.trajanje : phase === 'timovi' ? POTEGNI_TIMOVI_SEKUNDI : undefined}
      urgentAt={phase === 'vuca' ? 10 : 5}
    >
      {body}
    </GameFrame>
  );
}

// --- Izbor tima (1d) ---------------------------------------------------------

function IzborTima({
  host,
  meId,
  tim,
  canControl,
}: {
  host: PotegniHostData;
  meId: string;
  tim: PotegniTim;
  canControl: boolean;
}) {
  const clan = (t: PotegniTim) => host.igraci.filter((i) => i.tim === t);
  const nC = clan('crveni').length;
  const nP = clan('plavi').length;
  const holder = host.igraci.find((i) => i.playerId === host.kontrolaId);

  let savet: string;
  if (nC === nP) {
    savet = `Korak se računa po igraču: svaki tačan odgovor vuče ${potegniUdeo(Math.max(1, nC))} koraka.`;
  } else {
    const manji: PotegniTim = nC < nP ? 'crveni' : 'plavi';
    const [a, b] = nC > nP ? [nC, nP] : [nP, nC];
    savet =
      b === 0
        ? 'Jedna strana je prazna — pre početka se timovi sami pomire.'
        : `${a} na ${b} je u redu: korak se računa po igraču, pa ${TIM_IME[manji]} vuku jače po tačnom odgovoru.`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', paddingTop: 6 }}>
      <h2 className="display" style={{ fontWeight: 700, fontSize: '1.6rem', lineHeight: 1.1, margin: 0 }}>
        Izaberi stranu konopca
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(['crveni', 'plavi'] as const).map((t) => {
          const mine = t === tim;
          return (
            <button
              key={t}
              onClick={() => {
                if (mine) return;
                cue('sent');
                socket.emit('game:player-action', { action: 'potegni:tim', data: { tim: t } });
              }}
              style={{
                borderRadius: 18,
                background: TIM_BOJA[t],
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                textAlign: 'left',
                color: '#fff',
                boxShadow: mine ? '0 0 0 3px var(--text-primary)' : 'none',
                cursor: mine ? 'default' : 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span className="display" style={{ fontWeight: 800, fontSize: '1.4rem' }}>
                  {TIM_IME[t]}
                </span>
                {mine ? (
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,.2)',
                    }}
                  >
                    ✓ Ti si ovde
                  </span>
                ) : (
                  <span style={{ fontSize: '0.8rem', fontWeight: 800 }}>Pređi ›</span>
                )}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 34 }}>
                {clan(t).map((p) => (
                  <span
                    key={p.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px 4px 4px',
                      borderRadius: 999,
                      background: 'rgba(11,22,40,.25)',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      opacity: p.connected ? 1 : 0.5,
                    }}
                  >
                    <Avatar p={p} size={26} />
                    {p.playerId === meId ? 'Ti' : p.name}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <Napomena>{savet}</Napomena>
      <div style={{ flex: 1 }} />
      {canControl ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
          <button
            onClick={() => socket.emit('host:game-action', { action: 'potegni:pomiri' })}
            disabled={Math.abs(nC - nP) <= 1}
            style={{
              minHeight: 52,
              border: '1.5px solid var(--line2)',
              borderRadius: 16,
              background: 'transparent',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.95rem',
              opacity: Math.abs(nC - nP) <= 1 ? 0.45 : 1,
            }}
          >
            Pomiri timove
          </button>
          <button onClick={() => socket.emit('host:game-action', { action: 'potegni:pocni' })} style={goldBtn}>
            Počni igru
          </button>
        </div>
      ) : (
        <p style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: 'var(--dim)', margin: 0 }}>
          {holder ? `Igru pokreće ${holder.name}` : 'Igru pokreće TV'} — ili sama kreće kad istekne vreme.
        </p>
      )}
    </div>
  );
}

// --- Vuča: zadatak (1e/1f) i blokada (1g) --------------------------------------

function Vuca({
  host,
  my,
  meId,
  tim,
}: {
  host: PotegniHostData;
  my?: PotegniControllerData;
  meId: string;
  tim: PotegniTim;
}) {
  const blok = useBlokada(my?.promasaj);
  const prevTacno = useRef(my?.tacno ?? 0);
  useEffect(() => {
    const t = my?.tacno ?? 0;
    if (t > prevTacno.current) cue('correct');
    prevTacno.current = t;
  }, [my?.tacno]);

  if (blok > 0 && my?.promasaj) {
    const solo = host.mode === 'solo';
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          textAlign: 'center',
          background: verdictWash('wrong'),
        }}
      >
        <span
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--danger)',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: '2.2rem',
            fontWeight: 800,
            boxShadow: '0 0 0 10px rgba(250,246,240,.06), 0 0 30px rgba(224,106,94,.45)',
            animation: 'igra-pop .3s cubic-bezier(.34,1.56,.64,1), igra-nope .3s .3s',
          }}
        >
          ✕
        </span>
        <span
          className="display"
          style={{ marginTop: 12, fontWeight: 700, fontSize: '2.1rem', lineHeight: 1, color: 'var(--danger)' }}
        >
          Netačno
        </span>
        <span style={{ marginTop: 6, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', padding: '0 8px' }}>
          {my.promasaj.tekst} — tačno je <span style={{ color: 'var(--text-primary)' }}>{my.promasaj.tacno}</span>, ne{' '}
          {my.promasaj.dato}
        </span>
        <span style={{ marginTop: 4, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {solo ? 'Bot je dobio pola koraka.' : `${TIM_IME[PROTIVNIK[tim]]} su dobili pola koraka.`}
        </span>
        <Prsten ostalo={blok} ukupno={my.promasaj.ms} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <MiniArena host={host} meId={meId} />
      {my?.zadatak ? (
        <Zadatak key={my.zadatak.id} zadatak={my.zadatak} />
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Čeka se zadatak…</p>
      )}
    </div>
  );
}

/** Lokalno odbrojavanje blokade: kreće kad stigne novi promašaj. */
function useBlokada(promasaj: PotegniControllerData['promasaj']): number {
  const [ostalo, setOstalo] = useState(0);
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!promasaj || seen.current === promasaj.id) return;
    seen.current = promasaj.id;
    cue('wrong');
    const start = performance.now();
    setOstalo(promasaj.ms);
    const iv = setInterval(() => {
      const left = promasaj.ms - (performance.now() - start);
      setOstalo(Math.max(0, left));
      if (left <= 0) clearInterval(iv);
    }, 100);
    return () => clearInterval(iv);
  }, [promasaj]);
  return promasaj ? ostalo : 0;
}

function Prsten({ ostalo, ukupno }: { ostalo: number; ukupno: number }) {
  const pct = Math.max(0, Math.min(100, (ostalo / ukupno) * 100));
  return (
    <div
      style={{
        marginTop: 28,
        width: 132,
        height: 132,
        borderRadius: '50%',
        background: `conic-gradient(var(--danger) 0 ${pct}%, var(--bg-card) ${pct}% 100%)`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          width: 112,
          height: 112,
          borderRadius: '50%',
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="display" style={{ fontWeight: 800, fontSize: '2.6rem', lineHeight: 1 }}>
          {Math.ceil(ostalo / 1000)}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)' }}>s do sledećeg</span>
      </div>
    </div>
  );
}

function Zadatak({ zadatak }: { zadatak: PotegniZadatak }) {
  const [unos, setUnos] = useState('');
  // Poslato, čeka se novi zadatak — dupli tap ne šalje dvaput.
  const [poslato, setPoslato] = useState(false);
  useEffect(() => {
    if (!poslato) return;
    // Ako server odbije (npr. stigla pauza), posle 1,5 s opet može.
    const t = setTimeout(() => setPoslato(false), 1500);
    return () => clearTimeout(t);
  }, [poslato]);

  const posalji = (vrednost: string) => {
    if (poslato || !vrednost) return;
    setPoslato(true);
    cue('sent');
    socket.emit('game:player-action', {
      action: 'potegni:odgovor',
      data: { zadatakId: zadatak.id, vrednost },
    });
  };

  const [bg, ink] = PREDMET_BOJA[zadatak.predmet];
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        className="tg-deal"
        style={{
          padding: '14px 16px',
          borderRadius: 18,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            alignSelf: 'flex-start',
            fontSize: '0.75rem',
            fontWeight: 800,
            padding: '5px 10px',
            borderRadius: 999,
            background: bg,
            color: ink,
          }}
        >
          {POTEGNI_PREDMET_LABEL[zadatak.predmet]}
        </span>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.35rem', lineHeight: 1.2, textWrap: 'pretty' }}>
          {zadatak.tekst}
        </span>
        {zadatak.podtekst && (
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{zadatak.podtekst}</span>
        )}
      </div>

      {zadatak.opcije ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridAutoRows: '1fr',
              gap: 10,
              flex: 1,
              minHeight: 0,
              maxHeight: 300,
            }}
          >
            {zadatak.opcije.map((o) => (
              <button
                key={o}
                onClick={() => posalji(o)}
                disabled={poslato}
                className="display"
                style={{
                  borderRadius: 18,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--line)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: o.length > 9 ? '1.05rem' : o.length > 4 ? '1.4rem' : '2.2rem',
                  lineHeight: 1.15,
                  padding: '6px 8px',
                  minHeight: 64,
                  opacity: poslato ? 0.6 : 1,
                }}
              >
                {o}
              </button>
            ))}
          </div>
          <span style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700, color: 'var(--dim)' }}>
            Tapni odgovor, odmah se šalje.
          </span>
        </>
      ) : (
        <>
          <div
            style={{
              height: 56,
              flexShrink: 0,
              borderRadius: 16,
              background: 'var(--bg-primary)',
              border: '2px solid var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
            }}
          >
            <span
              className="display"
              style={{
                fontWeight: 800,
                fontSize: '1.9rem',
                fontVariantNumeric: 'tabular-nums',
                color: unos ? 'var(--text-primary)' : 'var(--dim)',
              }}
            >
              {unos || '?'}
            </span>
            {zadatak.jedinica && <span style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>{zadatak.jedinica}</span>}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gridAutoRows: 'minmax(40px, 1fr)',
              gap: 7,
              flex: 1,
              minHeight: 0,
              maxHeight: 230,
            }}
          >
            {TASTERI.map((k) => (
              <button
                key={k}
                className="display"
                onClick={() =>
                  setUnos((u) => {
                    if (k === '⌫') return u.slice(0, -1);
                    if (k === ',' && (u.includes(',') || u === '')) return u;
                    return (u + k).slice(0, 7);
                  })
                }
                style={{
                  borderRadius: 14,
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '1.4rem',
                }}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            onClick={() => posalji(unos)}
            disabled={!unos || poslato}
            style={{ ...goldBtn, minHeight: 52, flexShrink: 0, opacity: !unos || poslato ? 0.55 : 1 }}
          >
            Povuci! ✓
          </button>
        </>
      )}
    </div>
  );
}

// --- Kraj ------------------------------------------------------------------------

function Kraj({
  host,
  my,
  tim,
  hostless,
}: {
  host: PotegniHostData;
  my?: PotegniControllerData;
  tim: PotegniTim;
  hostless: boolean;
}) {
  const ishod = host.ishod;
  const solo = host.mode === 'solo';
  const pobeda = ishod?.pobednik === tim;
  const kind = !ishod || ishod.pobednik === null ? 'neutral' : pobeda ? 'correct' : 'wrong';
  const title =
    kind === 'neutral' ? 'Nerešeno' : pobeda ? 'Pobeda!' : solo ? 'Bot je jači' : 'Poraz';
  const razlog = !ishod
    ? ''
    : ishod.pobednik === null
      ? 'Čvor je ostao na sredini.'
      : ishod.razlog === 'crta'
        ? solo
          ? pobeda
            ? 'Dovukli ste čvor do svoje crte.'
            : 'Bot je dovukao čvor do svoje crte.'
          : `${TIM_IME[ishod.pobednik]} su dovukli čvor do svoje crte.`
        : solo
          ? pobeda
            ? 'Kad je isteklo vreme, čvor je bio bliže vama.'
            : 'Kad je isteklo vreme, čvor je bio bliže botu.'
          : `Kad je isteklo vreme, čvor je bio bliže ${ishod.pobednik === 'crveni' ? 'crvenima' : 'plavima'}.`;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        paddingTop: '1.2rem',
        textAlign: 'center',
        background: verdictWash(kind),
        overflowY: 'auto',
      }}
    >
      <RoundVerdict
        kind={kind}
        icon={kind === 'neutral' ? '🤝' : pobeda ? '🏆' : '🌊'}
        title={title}
        points={my?.poeni ?? 0}
        detail={`${my?.tacno ?? 0} tačnih · ${my?.netacno ?? 0} netačnih`}
      />
      <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>{razlog}</p>
      {hostless && host.statistika && <Statistika host={host} />}
    </div>
  );
}

/** Bez TV-a telefon pokazuje i ono što bi bilo na TV-u (1b), sažeto. */
function Statistika({ host }: { host: PotegniHostData }) {
  const ime = (id: string) => host.igraci.find((i) => i.playerId === id);
  const timovi: PotegniTim[] = host.mode === 'solo' ? ['crveni'] : ['crveni', 'plavi'];
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
      {timovi.map((t) => (
        <div
          key={t}
          style={{
            background: 'var(--bg-card)',
            borderTop: `4px solid ${TIM_BOJA[t]}`,
            borderRadius: 12,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span style={{ fontWeight: 800, color: TIM_BOJA[t], fontSize: '0.95rem' }}>
            {TIM_IME[t]} tim · {host.tacno[t]} ✓ · {host.netacno[t]} ✕
          </span>
          {host.statistika!
            .filter((s) => s.tim === t)
            .map((s) => {
              const p = ime(s.playerId);
              return (
                <div
                  key={s.playerId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 8,
                    borderLeft: `3px solid ${p?.avatarColor ?? 'var(--line2)'}`,
                    fontSize: '0.88rem',
                  }}
                >
                  <span>{p?.avatarEmoji}</span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p?.name ?? '—'}
                  </span>
                  {s.oznaka && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--accent)' }}>
                      {s.oznaka === 'munja' ? '⚡ MUNJA' : 'BEZ GREŠKE'}
                    </span>
                  )}
                  <span style={{ fontWeight: 800, color: 'var(--success-ink)' }}>{s.tacno} ✓</span>
                  <span style={{ fontWeight: 800, color: 'var(--danger)' }}>{s.netacno} ✕</span>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

// --- Mini arena (konopac na telefonu) ---------------------------------------------

function MiniArena({ host, meId }: { host: PotegniHostData; meId: string }) {
  const solo = host.mode === 'solo';
  const blok = new Set(host.blokirani);
  const knot = 50 - host.pozicija * 0.22;
  const pomak = host.pozicija * 0.1;
  const tim = (t: PotegniTim) => host.igraci.filter((i) => i.tim === t);
  const me = host.igraci.find((i) => i.playerId === meId);

  const red = (lista: PotegniIgrac[], side: 'left' | 'right') => (
    <div
      style={{
        position: 'absolute',
        [side]: `${1 + (side === 'left' ? -pomak : pomak)}%`,
        width: '27%',
        top: 'calc(42% - 34px)',
        display: 'flex',
        justifyContent: 'space-around',
        transition: `${side} .45s cubic-bezier(.34,1.56,.64,1)`,
      }}
    >
      {lista.slice(0, 6).map((p) => (
        <span
          key={p.playerId}
          style={{
            transform: `rotate(${side === 'left' ? -8 : 8}deg)`,
            opacity: blok.has(p.playerId) || !p.connected ? 0.45 : 1,
            outline: p.playerId === meId ? '2px solid var(--text-primary)' : undefined,
            borderRadius: '30%',
          }}
        >
          <Avatar p={p} size={24} />
        </span>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', height: 'clamp(100px, 19vh, 150px)', flexShrink: 0, overflow: 'hidden' }}>
      <Obale />
      {solo ? (
        <>
          <span
            style={{
              position: 'absolute',
              left: `${8 - pomak}%`,
              top: 'calc(42% - 44px)',
              transform: 'rotate(-8deg)',
              transition: 'left .45s cubic-bezier(.34,1.56,.64,1)',
            }}
          >
            {me && <Avatar p={me} size={34} />}
          </span>
          <span
            style={{
              position: 'absolute',
              right: `${8 + pomak}%`,
              top: 'calc(42% - 44px)',
              width: 34,
              height: 34,
              borderRadius: '30%',
              background: TIM_BOJA.plavi,
              display: 'grid',
              placeItems: 'center',
              fontSize: '1.1rem',
              transform: 'rotate(8deg)',
              transition: 'right .45s cubic-bezier(.34,1.56,.64,1)',
            }}
          >
            🤖
          </span>
        </>
      ) : (
        <>
          {red(tim('crveni'), 'left')}
          {red(tim('plavi'), 'right')}
        </>
      )}
      <span
        style={{
          position: 'absolute',
          top: '42%',
          left: `${knot}%`,
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'var(--amber)',
          border: '3px solid var(--text-primary)',
          transform: 'translate(-50%,-50%)',
          boxShadow: '0 0 18px rgba(227,180,94,.55)',
          transition: 'left .45s cubic-bezier(.34,1.56,.64,1)',
        }}
      />
      <span style={{ position: 'absolute', left: '4%', bottom: 6, fontSize: '0.75rem', fontWeight: 800 }}>
        {solo ? `${host.igraci.length > 1 ? 'Vi' : 'Ti'} · ${host.tacno.crveni} ✓` : `Crveni · ${host.tacno.crveni} ✓`}
      </span>
      <span style={{ position: 'absolute', right: '4%', bottom: 6, fontSize: '0.75rem', fontWeight: 800 }}>
        {solo ? `Bot · ${host.botPoteza ?? 0}` : `Plavi · ${host.tacno.plavi} ✓`}
      </span>
    </div>
  );
}

/** Obale, voda, crte i konopac — statični deo arene. */
function Obale() {
  const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s });
  return (
    <>
      <div
        style={abs({
          left: 0,
          bottom: 0,
          width: '28%',
          height: '52%',
          background: 'var(--bg-card)',
          borderTopRightRadius: 20,
          borderTop: '2px solid rgba(199,81,70,.7)',
        })}
      />
      <div
        style={abs({
          right: 0,
          bottom: 0,
          width: '28%',
          height: '52%',
          background: 'var(--bg-card)',
          borderTopLeftRadius: 20,
          borderTop: '2px solid rgba(79,128,184,.7)',
        })}
      />
      <div
        style={abs({
          left: '28%',
          right: '28%',
          bottom: 0,
          height: '18%',
          background: 'linear-gradient(180deg, rgba(111,194,187,.32), rgba(111,194,187,.08))',
          borderTop: '2px solid rgba(111,194,187,.6)',
        })}
      />
      <div style={abs({ left: '50%', top: '10%', bottom: '18%', borderLeft: '2px dashed var(--line2)' })} />
      <div style={abs({ left: '28%', top: '30%', height: '22%', borderLeft: `2px solid ${TIM_BOJA.crveni}` })} />
      <div style={abs({ left: '72%', top: '30%', height: '22%', borderLeft: `2px solid ${TIM_BOJA.plavi}` })} />
      <div
        style={abs({
          left: '2%',
          right: '2%',
          top: 'calc(42% - 3px)',
          height: 6,
          borderRadius: 3,
          background: 'repeating-linear-gradient(115deg,#c29b47 0 6px,#8f6e2c 6px 9px)',
        })}
      />
    </>
  );
}

function Avatar({ p, size }: { p: { avatarColor: string; avatarEmoji: string }; size: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '30%',
        background: p.avatarColor,
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.55,
        flexShrink: 0,
      }}
    >
      {p.avatarEmoji}
    </span>
  );
}

function Napomena({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 14,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--line)',
        fontSize: '0.85rem',
        lineHeight: 1.45,
        color: 'var(--text-secondary)',
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
