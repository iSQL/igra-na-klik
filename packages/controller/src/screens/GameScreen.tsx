import { GameRouter } from '../components/GameRouter';
import { PlayerMenu } from '../components/PlayerMenu';
import { useGameFrameMounted } from '../components/kit/GameFrame';

export function GameScreen() {
  // Games built on the shared GameFrame carry the menu in their header; the
  // floating circle stays only for the ones that haven't moved over yet.
  const framed = useGameFrameMounted();
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
      {!framed && (
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
      )}
    </div>
  );
}
