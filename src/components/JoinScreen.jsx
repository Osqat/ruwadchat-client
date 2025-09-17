import { useMemo, useState } from 'react';

const statusStyles = {
  connecting: { text: 'Connecting to server...', className: 'text-yellow-400' },
  connected: { text: 'Connected. Enter your details to join.', className: 'text-green-400' },
  failed: { text: 'Failed to connect to server. Retrying...', className: 'text-red-400' },
  disconnected: { text: 'Disconnected. Attempting to reconnect...', className: 'text-red-400' },
};

const JoinScreen = ({ onJoin, connectionState = 'connecting', isSocketReady = false }) => {
  const [username, setUsername] = useState('');
  const [room, setRoom] = useState('general');
  const [isJoining, setIsJoining] = useState(false);

  const connectionMeta = useMemo(() => statusStyles[connectionState] || statusStyles.connecting, [connectionState]);
  const isReady = isSocketReady && connectionState === 'connected';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isReady || !username.trim() || !room.trim() || isJoining) return;

    setIsJoining(true);
    try {
      await onJoin({ username: username.trim(), room: room.trim() });
    } catch (error) {
      console.error('Error joining:', error);
      setIsJoining(false);
    }
  };

  const isFormDisabled = isJoining;

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="bg-surface-2 p-8 rounded-lg shadow-xl w-full max-w-md border border-border">
        <div className="text-center mb-8 space-y-2">
          <h1 className="text-3xl font-bold text-white">Ruwad Chat</h1>
          <p className={`text-sm ${connectionMeta.className}`}>{connectionMeta.text}</p>
          <p className="text-muted text-xs">Enter your name to join the voice chat once connected.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-muted mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-field w-full"
              placeholder="Enter your username"
              maxLength={20}
              disabled={isFormDisabled}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="room" className="block text-sm font-medium text-muted mb-2">
              Room
            </label>
            <input
              type="text"
              id="room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="input-field w-full"
              placeholder="general"
              maxLength={30}
              disabled={isFormDisabled}
            />
            <p className="text-xs text-muted mt-1">Join any room name to chat with others.</p>
          </div>

          <button
            type="submit"
            disabled={!isReady || !username.trim() || !room.trim() || isJoining}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJoining ? 'Joining...' : 'Join Voice Chat'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-muted">
            Make sure your microphone is working and you have a stable internet connection
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinScreen;
