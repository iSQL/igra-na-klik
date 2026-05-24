import { GameRouter } from '../components/GameRouter';
import { LeaveRoomButton } from './../components/LeaveRoomButton';

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
      <LeaveRoomButton variant="overlay" />
    </div>
  );
}
