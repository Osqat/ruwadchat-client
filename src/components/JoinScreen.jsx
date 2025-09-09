import { useState } from 'react';

const JoinScreen = ({ onJoin }) => {
  const [username, setUsername] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (username.trim() && !isJoining) {
      setIsJoining(true);
      try {
        await onJoin(username.trim());
      } catch (error) {
        console.error('Error joining:', error);
        setIsJoining(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-discord-darker">
      <div className="bg-discord-dark p-8 rounded-lg shadow-xl w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Mini Discord</h1>
          <p className="text-discord-light">Enter your name to join the voice chat</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-discord-light mb-2">
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
              disabled={isJoining}
              autoFocus
            />
          </div>
          
          <button
            type="submit"
            disabled={!username.trim() || isJoining}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isJoining ? 'Joining...' : 'Join Voice Chat'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-xs text-discord-light">
            Make sure your microphone is working and you have a stable internet connection
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinScreen;
