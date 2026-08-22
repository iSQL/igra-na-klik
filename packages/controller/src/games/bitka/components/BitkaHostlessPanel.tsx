import type { BitkaHostData, BitkaPlayerView } from '@igra/shared';
import { BitkaQuestionImage } from './BitkaQuestionImage';
import { BitkaPackChip } from './BitkaPackChip';
import { BitkaMatricaCells, BitkaMatricaScoreRow } from './BitkaMatricaCells';
import { BitkaDominoView, BitkaRedosledView, BitkaTextView } from './BitkaNewTypes';

/**
 * Ono što je u TV sobi nosio televizor, a u hostless sobi nije nosio niko.
 *
 * Renderuje se **samo kad je `room.hostless`** — sa televizorom u prostoriji
 * ovo bi bilo dupliranje, a pravilo je da se TV-mode telefon ne menja.
 *
 * Sve što prikazuje već stiže u broadcast polovini stanja: pitanje i ponuđeni
 * odgovori, ko je odgovorio, red čekanja, kontekst runde. Tačan odgovor se ne
 * pogađa ovde — server ga pošalje tek kad krene otkrivanje.
 */

const PICK_PHASES = ['baza-izbor', 'osvajanje-izbor', 'napad-izbor'];

export function BitkaHostlessPanel({
  host,
  phase,
  myPlayerId,
}: {
  host: BitkaHostData;
  phase: string;
  myPlayerId: string;
}) {
  const named = (id: string | null | undefined) =>
    host.players.find((p) => p.playerId === id)?.name ?? 'Igrač';
  const territoryName = (id: string | null | undefined) =>
    host.map.territories.find((t) => t.id === id)?.name ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', width: '100%' }}>
      <Context host={host} phase={phase} />
      <Body host={host} phase={phase} myPlayerId={myPlayerId} named={named} territoryName={territoryName} />
    </div>
  );
}

/** „Rat · runda 3 · zamkova još 2" — gde smo u partiji. */
function Context({ host, phase }: { host: BitkaHostData; phase: string }) {
  const standing = host.players.filter((p) => !p.eliminated).length;
  const text =
    host.round > 0
      ? `Rat · runda ${host.round} · zamkova još ${standing}`
      : host.osvajanjeRound
        ? `Osvajanje zemlje · ${host.osvajanjeRound}. pitanje`
        : phase === 'uvod'
          ? host.map.name
          : host.map.name;
  return (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
      {text}
    </div>
  );
}

/** Faze u kojima rečenicu poteza nosi centralna Objava, ne traka. */
const OBJAVA_PHASES = new Set(['redosled-pitanje', 'osvajanje-pitanje', 'duel-pitanje', 'duel-ishod']);

function Body({
  host,
  phase,
  myPlayerId,
  named,
  territoryName,
}: {
  host: BitkaHostData;
  phase: string;
  myPlayerId: string;
  named: (id: string | null | undefined) => string;
  territoryName: (id: string | null | undefined) => string;
}) {
  // Isto pravilo kao na TV-u (`objavaUp`): dok Objava preko mape nosi poruku
  // — odbrojavanje sa posledicom prethodnog poteza, najava duela, prozor
  // ishoda — traka ćuti. Inače „Zamak je pao — sve preuzima Pera!" stoji i
  // u prozoru i iznad mape u istom kadru.
  if (OBJAVA_PHASES.has(phase)) return null;

  if (phase === 'uvod') {
    return (
      <Card>
        <strong style={{ fontSize: '0.85rem' }}>Svako bira svoj zamak</strong>
        <Small>
          Kroz pitanja se osvaja zemlja. Ko sruši tri zida tuđeg zamka — uzima sve njegovo.
        </Small>
      </Card>
    );
  }

  // U fazama izbora naslov poteza („Pera bira slobodnu teritoriju") nosi SAMO
  // centralna kartica preko mape — ovde ostaju red čekanja i pravilo, da ista
  // rečenica ne stoji na dva mesta u istom kadru.
  if (phase === 'baza-izbor') {
    const done = new Set(host.baseCommittedIds ?? []);
    const queue = (host.pickQueue ?? []).slice(1);
    return (
      <Card>
        <Small>
          {queue.length > 0 ? (
            <>
              Na redu posle:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {queue.map(named).join(', ')}
              </strong>
            </>
          ) : (
            'Poslednji zamak u ovoj partiji.'
          )}
        </Small>
        <Chips
          players={host.players}
          myPlayerId={myPlayerId}
          label={(p) =>
            done.has(p.playerId)
              ? 'utvrđen'
              : p.playerId === host.activePlayerId
                ? 'bira…'
                : 'čeka'
          }
          dim={(p) => !done.has(p.playerId) && p.playerId !== host.activePlayerId}
        />
      </Card>
    );
  }

  if (phase === 'osvajanje-izbor' || phase === 'napad-izbor') {
    const queue = (host.pickQueue ?? []).slice(1);
    return (
      <Card>
        {phase === 'napad-izbor' ? (
          <Small>Napada se susedna tuđa ili ničija teritorija.</Small>
        ) : (
          <Small>
            {queue.length > 0 ? (
              <>
                Na redu posle:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>
                  {queue.map(named).join(', ')}
                </strong>
              </>
            ) : (
              'Poslednji izbor u ovoj rundi.'
            )}
          </Small>
        )}
      </Card>
    );
  }

  if (phase === 'duel-rezultat' && host.duel) {
    // Samo rečenica o ishodu — serverov `lastEvent` („Pera osvaja Porodin."),
    // ista koju nosi i TV. Pitanje i tačan odgovor su odgledani na svojim
    // ekranima (`duel-odgovor-rezultat`, `duel-broj-rezultat`), a ovde se prati
    // mapa. Server pitanje u ovoj fazi i ne šalje.
    const text = host.lastEvent ?? 'Ishod napada';
    return (
      <Card>
        <strong style={{ fontSize: '0.9rem', color: 'var(--accent)' }}>{text}</strong>
      </Card>
    );
  }

  if (host.question) {
    return (
      <Card>
        <Question host={host} revealing={phase.endsWith('-rezultat')} />
        <Chips
          players={host.players.filter((p) => (host.expectedIds ?? []).includes(p.playerId))}
          myPlayerId={myPlayerId}
          label={(p) => {
            if (phase.endsWith('-rezultat')) {
              const r = host.results?.find((x) => x.playerId === p.playerId);
              // Kod broja nema „tačno" — svaka procena je nešto vredna, pa
              // stoji sam broj i svako vidi koliko je promašio.
              if (host.question?.kind === 'broj') {
                return r?.value == null ? 'nije stigao' : String(r.value);
              }
              // Kod stepenovanih tipova „tačno/netačno" krije upravo ono što
              // je odlučilo — 2:3 je pobeda, a izgledalo bi isto kao 3:3.
              const q = host.question;
              if (q?.kind === 'matrica') {
                if (!r?.cells) return 'nije stigao';
                return `${r.score ?? 0}/${q.pick ?? 3}`;
              }
              if (q?.kind === 'redosled') {
                if (!r?.order) return 'nije stigao';
                return `${r.score ?? 0}/${(q.items ?? []).length}`;
              }
              if (q?.kind === 'domino') {
                return `${r?.streak ?? 0}/${q.steps ?? 1}`;
              }
              return r?.correct ? 'tačno' : 'netačno';
            }
            return (host.answeredIds ?? []).includes(p.playerId) ? 'odgovorio' : '…';
          }}
          dim={(p) =>
            !phase.endsWith('-rezultat') && !(host.answeredIds ?? []).includes(p.playerId)
          }
          good={(p) =>
            phase.endsWith('-rezultat') && host.question?.kind !== 'broj'
              ? host.results?.find((x) => x.playerId === p.playerId)?.correct
              : undefined
          }
        />
        {/* Uvodni broj određuje ko prvi bira zamak — to piše samo u lastEvent,
            a ostala otkrivanja se čitaju iz samih pločica. */}
        {phase === 'redosled-rezultat' && host.lastEvent && <Small>{host.lastEvent}</Small>}
      </Card>
    );
  }

  if (!host.lastEvent) return null;
  return (
    <Card>
      <Small>{host.lastEvent}</Small>
    </Card>
  );
}

/**
 * Pitanje sa ponuđenim odgovorima. Bez ovoga posmatrač duela gleda prazan
 * ekran — odgovaraju dvojica, a treći nema pojma ni šta se pita.
 */
function Question({ host, revealing }: { host: BitkaHostData; revealing: boolean }) {
  const q = host.question;
  if (!q) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {/* Traka stoji uz mapu i sve u njoj je levo poravnato, pa i kategorija. */}
      <BitkaPackChip name={q.packName} align="left" size="0.62rem" />
      <div style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.25 }}>{q.text}</div>
      {/* Traka je uska i stoji uz mapu, pa slika ide niža nego na ekranu
          pitanja — dovoljno da se vidi šta se pita, a mapa ostaje glavna. */}
      <BitkaQuestionImage url={q.imageUrl} maxHeight="16vh" />
      {q.kind === 'izbor' && q.options && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
          {q.options.map((o) => {
            const right = revealing && host.correctIndex === o.index;
            // Ko je izabrao baš ovaj odgovor — isto kao na TV-u i na ekranu
            // pitanja, pa se ishod svuda čita na isti način.
            const takers = revealing
              ? (host.results ?? [])
                  .filter((r) => r.optionIndex === o.index)
                  .map((r) => host.players.find((p) => p.playerId === r.playerId))
                  .filter((p): p is BitkaPlayerView => !!p)
              : [];
            return (
              <span
                key={o.index}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '7px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#fff',
                  background: right ? 'var(--success)' : o.color,
                  opacity: revealing && !right ? 0.3 : 1,
                }}
              >
                {right && <span>✓</span>}
                <span>{o.text}</span>
                {takers.map((p) => (
                  <span key={p.playerId} style={{ fontSize: '0.8rem' }}>
                    {p.avatarEmoji}
                  </span>
                ))}
              </span>
            );
          })}
        </div>
      )}
      {q.kind === 'matrica' && q.cells && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <BitkaMatricaCells
            cells={q.cells}
            correctCells={revealing ? host.correctCells : undefined}
            results={revealing ? (host.results ?? []) : undefined}
            players={host.players}
            revealing={revealing}
            compact
          />
          {revealing && (
            <BitkaMatricaScoreRow
              results={host.results ?? []}
              players={host.players}
              pick={q.pick ?? 3}
            />
          )}
        </div>
      )}
      {q.kind === 'redosled' && (
        <BitkaRedosledView
          question={q}
          host={host}
          results={revealing ? (host.results ?? []) : undefined}
          revealing={revealing}
          compact
        />
      )}
      {q.kind === 'domino' && (
        <BitkaDominoView
          question={q}
          host={host}
          results={revealing ? (host.results ?? []) : undefined}
          revealing={revealing}
          compact
        />
      )}
      {q.kind === 'tekst' && (
        <BitkaTextView
          question={q}
          host={host}
          results={revealing ? (host.results ?? []) : undefined}
          revealing={revealing}
          compact
        />
      )}
      {q.kind === 'broj' && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Opseg {q.min}–{q.max}
          {q.unit ? ` ${q.unit}` : ''}
          {revealing && host.correctValue != null && (
            <strong style={{ color: 'var(--accent)' }}>
              {' '}· tačno: {host.correctValue}
              {q.unit ? ` ${q.unit}` : ''}
            </strong>
          )}
        </div>
      )}
    </div>
  );
}

/** Ko je odgovorio, ko još bira — TV je to imao, telefon nije. */
function Chips({
  players,
  myPlayerId,
  label,
  dim,
  good,
}: {
  players: BitkaPlayerView[];
  myPlayerId: string;
  label: (p: BitkaPlayerView) => string;
  dim: (p: BitkaPlayerView) => boolean;
  good?: (p: BitkaPlayerView) => boolean | undefined;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {players.map((p) => {
        const ok = good?.(p);
        return (
          <span
            key={p.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.12rem 0.4rem',
              borderRadius: '999px',
              fontSize: '0.7rem',
              fontWeight: 700,
              background: 'rgba(255,255,255,0.07)',
              border: `1px solid ${
                ok === true ? 'var(--success)' : ok === false ? 'var(--danger)' : 'var(--line2)'
              }`,
              opacity: dim(p) ? 0.5 : 1,
            }}
          >
            <span>{p.avatarEmoji}</span>
            <span>{p.playerId === myPlayerId ? 'ti' : p.name}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{label(p)}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Uska tabla poena — u hostless sobi ne postoji drugo mesto gde se vidi ko
 * vodi. Pun prikaz i dalje živi u profilnom popupu.
 */
export function BitkaMiniStandings({
  host,
  myPlayerId,
}: {
  host: BitkaHostData;
  myPlayerId: string;
}) {
  const sorted = [...host.players].sort((a, b) => b.score - a.score);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' }}>
      {sorted.map((p) => (
        <span
          key={p.playerId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.28rem',
            padding: '0.15rem 0.45rem',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 700,
            background: 'rgba(0,0,0,0.45)',
            borderLeft: `3px solid ${p.avatarColor}`,
            textShadow: 'none',
            opacity: p.eliminated ? 0.45 : 1,
          }}
        >
          <span>{p.avatarEmoji}</span>
          <span>{p.playerId === myPlayerId ? 'ti' : p.name}</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            {p.eliminated ? 'ispao' : `${p.territories}t`}
          </span>
          <strong style={{ color: 'var(--accent)' }}>{p.score}</strong>
        </span>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        padding: '0.45rem 0.55rem',
        borderRadius: '10px',
        background: 'rgba(0,0,0,0.55)',
        border: '1px solid var(--line2)',
        textAlign: 'left',
        textShadow: 'none',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

function Small({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
      {children}
    </span>
  );
}
