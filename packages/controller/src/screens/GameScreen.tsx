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
          top: 'calc(0.6rem + var(--safe-top, 0px))',
          left: 'calc(0.6rem + var(--safe-left, 0px))',
          zIndex: 50,
        }}
      >
        <PlayerMenu inGame />
      </div>
    </div>
  );
}
