import { useState } from 'react';
import { GAME_DEFINITIONS } from '@igra/shared';
import { useT } from '../i18n/useT';
import { BottomSheet, SheetRow } from './BottomSheet';
import { LanguageSwitch } from './LanguageSwitch';
import { copyText } from './CopyRoomLinkButton';
import { useRulesStore } from './RulesScreen';
import { CueToggles } from './CueToggles';

/**
 * Start screen ⋯ menu: TV play, game rules, language and zabari.net — the
 * things the old landing page carried, now that `/` opens the join screen.
 * "Igraj na TV-u" is a second step inside the same sheet: on a phone, a TV
 * session means telling you what to open on the TV (creating a room here
 * would just leave an orphan room behind).
 */
export function StartMenu({
  onClose,
  onEnterCode,
}: {
  onClose: () => void;
  /** "Upiši kod sa TV-a" — close and put the cursor in the code boxes. */
  onEnterCode: () => void;
}) {
  const t = useT();
  const [view, setView] = useState<'menu' | 'tv'>('menu');

  return (
    <BottomSheet label={t('start.menu')} onClose={onClose}>
      {view === 'menu' ? (
        <MenuView
          onTv={() => setView('tv')}
          onRules={() => {
            onClose();
            useRulesStore.getState().show();
          }}
        />
      ) : (
        <TvView onBack={() => setView('menu')} onEnterCode={onEnterCode} />
      )}
    </BottomSheet>
  );
}

function MenuView({ onTv, onRules }: { onTv: () => void; onRules: () => void }) {
  const t = useT();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SheetRow
        icon="🖥️"
        tint="#6d9bd1"
        title={t('start.tvTitle')}
        hint={t('start.tvHint')}
        onClick={onTv}
      />
      <SheetRow
        icon="📖"
        tint="#a9c46c"
        title={t('start.rulesTitle')}
        hint={t('start.rulesHint', { n: Object.keys(GAME_DEFINITIONS).length })}
        onClick={onRules}
      />
      <CueToggles />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          minHeight: 64,
          padding: '0 10px',
        }}
      >
        <span style={{ flex: 1, fontWeight: 800, fontSize: '1rem' }}>{t('start.language')}</span>
        <LanguageSwitch large />
      </div>
      <div
        style={{
          margin: '0 10px',
          paddingTop: 16,
          borderTop: '1px solid var(--line)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.82rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
        }}
      >
        <span>{t('start.municipality')}</span>
        <a
          href="https://zabari.net"
          target="_blank"
          rel="noopener"
          className="display"
          style={{
            fontWeight: 700,
            fontSize: '0.95rem',
            color: 'var(--text-primary)',
            textDecoration: 'none',
            padding: '8px 0',
          }}
        >
          zabari<span style={{ color: 'var(--amber)' }}>.net</span> ↗
        </a>
      </div>
    </div>
  );
}

function TvView({ onBack, onEnterCode }: { onBack: () => void; onEnterCode: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const hostUrl = `${window.location.origin}/host/`;
  // What the phone can't do on its own — derived, so the line stays true
  // when a game's hostless support changes.
  const tvOnly = Object.values(GAME_DEFINITIONS)
    .filter((g) => !g.supportsHostless)
    .map((g) => t(`game.${g.id}.name`));

  const copy = async () => {
    if (await copyText(hostUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const step = (n: number) => (
    <span
      className="display"
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: 'var(--accent)',
        color: 'var(--bg-primary)',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: '1.05rem',
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <button
          onClick={onBack}
          aria-label={t('start.back')}
          style={{
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            padding: 0,
            borderRadius: 14,
            background: 'var(--bg-primary)',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '1.4rem',
            fontWeight: 800,
          }}
        >
          ‹
        </button>
        <span className="display" style={{ fontWeight: 700, fontSize: '1.6rem' }}>
          {t('start.tvTitle')}
        </span>
      </div>
      <p
        style={{
          margin: '10px 0 0',
          fontSize: '0.9rem',
          lineHeight: 1.45,
          color: 'var(--text-secondary)',
        }}
      >
        {t('tv.intro')}
        {tvOnly.length > 0 && <> {t('tv.unlocks', { games: tvOnly.join(', ') })}</>}
      </p>

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {step(1)}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0, paddingTop: 4 }}>
            <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>{t('tv.step1')}</span>
            <span
              style={{
                height: 52,
                padding: '0 8px 0 14px',
                borderRadius: 14,
                background: 'var(--bg-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--amber)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {window.location.host}/host
              </span>
              <button
                onClick={copy}
                style={{
                  height: 38,
                  minHeight: 38,
                  padding: '0 12px',
                  borderRadius: 10,
                  background: copied ? 'var(--success)' : 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}
              >
                {copied ? t('room.copied') : t('tv.copy')}
              </button>
            </span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {step(2)}
          <span style={{ fontWeight: 800, fontSize: '0.95rem', paddingTop: 6 }}>{t('tv.step2')}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {step(3)}
          <span style={{ fontWeight: 800, fontSize: '0.95rem', paddingTop: 6 }}>{t('tv.step3')}</span>
        </div>
      </div>

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn-primary" onClick={onEnterCode}>
          {t('tv.enterCode')}
        </button>
        <a
          href="/host/"
          className="btn-ghost"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            fontWeight: 800,
          }}
        >
          {t('tv.thisDevice')}
        </a>
      </div>
    </div>
  );
}
