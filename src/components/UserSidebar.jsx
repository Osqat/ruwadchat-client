import { useState } from 'react';

const UserSidebar = ({ 
  users, 
  currentUser, 
  isMuted, 
  onToggleMute, 
  onLeave,
  speakingUsers = new Set()
}) => {
  const [muteAll, setMuteAll] = useState(false);

  const handleMuteAll = () => {
    setMuteAll(!muteAll);
    // This would be implemented to mute all remote audio
  };

  const MicIcon = ({ isMuted }) => (
    <svg 
      className={`w-4 h-4 ${isMuted ? 'text-discord-red' : 'text-discord-green'}`} 
      fill="currentColor" 
      viewBox="0 0 20 20"
    >
      {isMuted ? (
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z M10 14a4 4 0 100-8 4 4 0 000 8zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" />
      ) : (
        <path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z M5.5 9.643a.75.75 0 00-1.5 0V10c0 3.06 2.29 5.585 5.25 5.954V17.5h-1.5a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-1.5v-1.546A6.001 6.001 0 0016 10v-.357a.75.75 0 00-1.5 0V10a4.5 4.5 0 01-9 0v-.357z" />
      )}
    </svg>
  );

  const SpeakerIcon = () => (
    <svg className="w-4 h-4 text-discord-light" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 3.75a.75.75 0 00-1.264-.546L5.203 6H2.667a.75.75 0 00-.75.75v6.5c0 .414.336.75.75.75h2.536l3.533 2.796A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 011.06 0c2.067 2.067 2.067 5.422 0 7.49a.75.75 0 01-1.06-1.061 3.992 3.992 0 000-5.368.75.75 0 010-1.06z" />
    </svg>
  );

  return (
    <div className="w-64 bg-discord-darker flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Voice Chat</h2>
        <p className="text-sm text-discord-light">{users.length} member{users.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {users.map((user) => {
            const isCurrentUser = user.id === currentUser?.id;
            const isSpeaking = speakingUsers.has(user.id);
            
            return (
              <div
                key={user.id}
                className={`user-item ${isSpeaking ? 'speaking' : ''}`}
              >
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm mr-3"
                  style={{ backgroundColor: user.color }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-medium truncate">
                      {user.username}
                      {isCurrentUser && <span className="text-discord-light text-sm ml-1">(you)</span>}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1">
                  <MicIcon isMuted={isCurrentUser ? isMuted : user.isMuted} />
                  {isSpeaking && (
                    <div className="w-2 h-2 bg-discord-green rounded-full animate-pulse" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-700 space-y-3">
        {/* Current User Info */}
        <div className="flex items-center space-x-3 p-2 bg-discord-dark rounded">
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
            style={{ backgroundColor: currentUser?.color }}
          >
            {currentUser?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{currentUser?.username}</p>
            <p className="text-xs text-discord-light">
              {isMuted ? 'Muted' : 'Unmuted'}
            </p>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onToggleMute}
            className={`flex items-center justify-center p-2 rounded transition-colors ${
              isMuted 
                ? 'bg-discord-red hover:bg-red-600' 
                : 'bg-discord-green hover:bg-green-600'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <MicIcon isMuted={isMuted} />
          </button>
          
          <button
            onClick={handleMuteAll}
            className="flex items-center justify-center p-2 bg-discord-dark hover:bg-gray-600 rounded transition-colors"
            title="Mute All"
          >
            <SpeakerIcon />
          </button>
        </div>

        <button
          onClick={onLeave}
          className="btn-danger w-full"
        >
          Leave
        </button>
      </div>
    </div>
  );
};

export default UserSidebar;
