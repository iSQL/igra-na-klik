import { GAME_DEFINITIONS } from '@igra/shared';
import { useRoomStore } from '../store/roomStore';
import { useGameStore } from '../store/gameStore';
import { socket } from '../socket';
import { PlayerList } from '../components/PlayerList';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { LobbyChatPanel } from '../components/LobbyChatPanel';
import { CloseRoomButton } from '../components/CloseRoomButton';
import { useT } from '../i18n/useT';

// Lowest minPlayers across all registered games — gate the lobby on this so
// games with a low floor aren't blocked by a hard 2. In dev the floor drops to
// 1 so a single tab can reach game-select and start Kviz solo.
const MIN_PLAYERS_OVERALL = import.meta.env.DEV
  ? 1
  : Math.min(...Object.values(GAME_DEFINITIONS).map((g) => g.minPlayers));

export function LobbyScreen() {
  const { room, players, setStatus, remoteHostPlayerId } = useRoomStore();
  const lastStartPayload = useGameStore((s) => s.lastStartPayload);
  const t = useT();

  if (!room) return null;

  const canStart = players.length >= MIN_PLAYERS_OVERALL;
  const remoteHostName = remoteHostPlayerId
    ? players.find((p) => p.id === remoteHostPlayerId)?.name
    : null;
  const minNoun = t(
    MIN_PLAYERS_OVERALL === 1 ? 'common.player.one' : 'common.player.many'
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 10 }}>
        <LanguageSwitch />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          padding: '2rem',
          width: '100%',
          maxWidth: '900px',
          // Center vertically when it fits; when the content is taller than the
          // viewport the auto margins collapse and the outer div scrolls instead
          // of clipping the title / close button.
          margin: 'auto',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
        {/* Reverse cut of the mark — the lobby canvas is navy. The tumble is
            pure CSS (see global.css) so it costs no re-renders while the lobby
            sits open for minutes at a time. */}
        <img
          className="ink-mark-tumble"
          src={`${import.meta.env.BASE_URL}ink-mark-reverse.svg`}
          alt=""
          width={76}
          height={76}
        />
        <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>
          {t('common.appName')}
        </h1>
      </div>

      <div
        style={{
          fontSize: '5rem',
          fontWeight: 800,
          letterSpacing: '0.5rem',
          color: 'var(--accent)',
          fontFamily: 'monospace',
        }}
      >
        {room.code}
      </div>

      <QRCodeDisplay roomCode={room.code} />

      <div style={{ width: '100%', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>
          {t('lobby.players')} ({players.length}/{room.settings.maxPlayers})
        </h2>
        <PlayerList
          players={players}
          onKick={(playerId) =>
            socket.emit('host:kick-player', { playerId })
          }
        />
      </div>

      {remoteHostName && (
        <div
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--bg-card)',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            color: 'var(--text-secondary)',
          }}
        >
          🎮 <strong style={{ color: 'var(--accent)' }}>{remoteHostName}</strong>{' '}
          {t('lobby.holdsControlFromPhone')}
        </div>
      )}

      <button
        disabled={!canStart}
        onClick={() => setStatus('game-select')}
        style={{
          padding: '1rem 3rem',
          fontSize: '1.5rem',
          fontWeight: 700,
          borderRadius: '1rem',
          background: canStart ? 'var(--accent)' : '#333',
          color: canStart ? '#fff' : '#666',
          transition: 'background 0.2s',
        }}
      >
        {canStart
          ? t('lobby.chooseGame')
          : t('lobby.needAtLeast', { n: MIN_PLAYERS_OVERALL, noun: minNoun })}
      </button>

      {canStart && lastStartPayload && (
        <button
          onClick={() => socket.emit('host:start-game', lastStartPayload)}
          style={{
            padding: '0.7rem 1.6rem',
            fontSize: '1.05rem',
            fontWeight: 700,
            borderRadius: '0.75rem',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '2px solid var(--accent)',
          }}
        >
          {t('lobby.playAgain', {
            name: t(`game.${lastStartPayload.gameId}.name`),
          })}
        </button>
      )}

        <LobbyChatPanel />

        <CloseRoomButton />
      </div>
    </div>
  );
}
