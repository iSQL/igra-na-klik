import type { CSSProperties, ReactNode } from 'react';
import type { PotegniBot, PotegniMode, PotegniPredmet, PotegniTezina } from '@igra/shared';
import { POTEGNI_PREDMETI, POTEGNI_PREDMET_LABEL, POTEGNI_TRAJANJA } from '@igra/shared';

export interface PotegniConfigValue {
  mode: PotegniMode;
  predmeti: PotegniPredmet[];
  tezina: PotegniTezina;
  trajanje: number;
  bot: PotegniBot;
}

export const POTEGNI_CONFIG_DEFAULT: PotegniConfigValue = {
  mode: 'timovi',
  predmeti: [...POTEGNI_PREDMETI],
  tezina: 'srednja',
  trajanje: 180,
  bot: 'srednji',
};

/** Podešavanja Povuci-potegni na telefonu domaćina (dizajn 1c). */
export function PotegniConfig({
  value,
  onChange,
  players,
}: {
  value: PotegniConfigValue;
  onChange: (v: PotegniConfigValue) => void;
  players: number;
}) {
  const set = (patch: Partial<PotegniConfigValue>) => onChange({ ...value, ...patch });
  const togglePredmet = (p: PotegniPredmet) => {
    const has = value.predmeti.includes(p);
    // Bar jedan predmet uvek ostaje izabran.
    if (has && value.predmeti.length === 1) return;
    set({
      predmeti: has
        ? value.predmeti.filter((x) => x !== p)
        : POTEGNI_PREDMETI.filter((x) => x === p || value.predmeti.includes(x)),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Group label="Mod" gold>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ModCard active={value.mode === 'timovi'} icon="👥" label="Dva tima" onClick={() => set({ mode: 'timovi' })} />
          <ModCard active={value.mode === 'solo'} icon="🤖" label="Solo protiv bota" onClick={() => set({ mode: 'solo' })} />
        </div>
        {value.mode === 'timovi' && players < 2 && (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--danger)' }}>
            Za dva tima treba bar dvoje.
          </span>
        )}
      </Group>
      <Group label="Predmet">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {POTEGNI_PREDMETI.map((p) => {
            const on = value.predmeti.includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePredmet(p)}
                aria-pressed={on}
                style={{
                  height: 40,
                  padding: '0 14px',
                  borderRadius: 999,
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  background: on ? 'var(--accent)' : 'var(--bg-primary)',
                  color: on ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: on ? '1px solid transparent' : '1px solid var(--line2)',
                }}
              >
                {POTEGNI_PREDMET_LABEL[p]}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--dim)' }}>Sva tri izabrana = mešano.</span>
      </Group>
      <Group label="Težina">
        <Segmented
          value={value.tezina}
          options={[
            ['osnovna', 'Osnovna'],
            ['srednja', 'Srednja'],
            ['mesovito', 'Mešovito'],
          ]}
          onSelect={(v) => set({ tezina: v as PotegniTezina })}
        />
      </Group>
      <Group label="Trajanje">
        <Segmented
          value={String(value.trajanje)}
          options={POTEGNI_TRAJANJA.map((s) => [String(s), `${s / 60} min`] as [string, string])}
          onSelect={(v) => set({ trajanje: Number(v) })}
        />
      </Group>
      {value.mode === 'solo' && (
        <Group label="Bot">
          <Segmented
            value={value.bot}
            options={[
              ['lak', 'Lak'],
              ['srednji', 'Srednji'],
              ['tezak', 'Težak'],
            ]}
            onSelect={(v) => set({ bot: v as PotegniBot })}
          />
        </Group>
      )}
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
        {value.mode === 'solo'
          ? 'Svi igrači vuku crveno, bot vuče plavo svojim tempom. Netačno daje botu pola koraka i blokira te 3 s.'
          : 'Tačno vuče tvoj tim za 1 korak podeljen brojem igrača u timu. Netačno daje pola koraka protivniku i blokira te 3 s. Timove birate posle pokretanja.'}
      </div>
    </div>
  );
}

function Group({ label, gold, children }: { label: string; gold?: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: gold ? 'var(--amber)' : 'var(--text-secondary)',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function ModCard({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const style: CSSProperties = {
    height: 72,
    borderRadius: 16,
    background: active ? 'rgba(194,155,71,.16)' : 'var(--bg-primary)',
    border: active ? '1px solid var(--accent)' : '1px solid var(--line)',
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  };
  return (
    <button onClick={onClick} aria-pressed={active} style={style}>
      <span style={{ fontSize: '1.25rem' }}>{icon}</span>
      <span style={{ fontSize: '0.88rem', fontWeight: 800 }}>{label}</span>
    </button>
  );
}

function Segmented({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: [string, string][];
  onSelect: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 6,
        padding: 4,
        borderRadius: 14,
        background: 'var(--bg-secondary)',
      }}
    >
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <button
            key={v}
            onClick={() => onSelect(v)}
            aria-pressed={on}
            style={{
              height: 44,
              borderRadius: 10,
              fontWeight: 800,
              fontSize: '0.85rem',
              background: on ? 'var(--bg-card)' : 'transparent',
              color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
