import { GameRouter } from '../components/GameRouter';
import { PlayerMenu } from '../components/PlayerMenu';

export function GameScreen() {
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
          bottom: 'calc(0.6rem + var(--safe-bottom, 0px))',
          right: 'calc(0.6rem + var(--safe-right, 0px))',
          zIndex: 50,
        }}
      >
        <PlayerMenu inGame />
      </div>
    </div>
  );
}
