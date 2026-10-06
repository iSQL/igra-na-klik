import { GameRouter } from '../components/GameRouter';
import { PlayerMenu } from '../components/PlayerMenu';
import { useGameFrameMounted } from '../components/kit/GameFrame';
import { FirstTimeHint } from '../components/FirstTimeHint';
import { useGameStore } from '../store/gameStore';
import { PauseOverlay } from '../components/PauseOverlay';
import { PlayersPanel } from '../components/PlayersPanel';
import { EndGameSheet } from '../components/EndGameSheet';
import { WaitingStrip } from '../components/kit/WaitingStrip';

export function GameScreen() {
  // Games built on the shared GameFrame carry the menu in their header; the
  // floating circle stays only for the ones that haven't moved over yet.
  const framed = useGameFrameMounted();
  const gameId = useGameStore((s) => s.gameId);
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
      {gameId && <FirstTimeHint key={gameId} gameId={gameId} />}
      {/* Tok igre: the holder's waiting strip, the pause screen, and the
          panels the player menu opens (Igrači, Završi igru). */}
      <WaitingStrip />
      <PauseOverlay />
      <PlayersPanel />
      <EndGameSheet />
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
