import { GameRouter } from '../components/GameRouter';
import { LeaveRoomButton } from '../components/LeaveRoomButton';
import { StopGameButton } from '../components/StopGameButton';
import { usePlayerStore } from '../store/playerStore';

export function GameScreen() {
  const { player, room } = usePlayerStore();
  const iAmRemoteHost =
    !!player && !!room && room.remoteHostPlayerId === player.id;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <GameRouter />
      <div
        style={{
          position: 'fixed',
          top: '0.6rem',
          right: '0.6rem',
          zIndex: 50,
          display: 'flex',
          gap: '0.4rem',
        }}
      >
        {iAmRemoteHost && <StopGameButton />}
        <LeaveRoomButton variant="overlay" />
      </div>
    </div>
  );
}
