import { useState, useEffect, useRef } from 'react';

const ChatPanel = ({ socket, messages, currentUser }) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('chat-message', { message: newMessage.trim() });
      setNewMessage('');
      inputRef.current?.focus();
    }
  };

  const formatTime = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch (e) {
      console.error('Error formatting timestamp:', timestamp, e);
      return 'Invalid Time';
    }
  };

  return (
    <div className="flex flex-col h-full bg-discord-dark">
      {/* Chat Header */}
      <div className="p-4 border-b border-gray-600">
        <h2 className="text-lg font-semibold text-white flex items-center">
          <span className="mr-2">#</span>
          general
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="text-center text-discord-light py-8">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => {
            // Add checks for message properties
            const username = message?.username || 'Unknown';
            const msgContent = message?.message || 'Empty message';
            const userColor = message?.userColor || '#CCCCCC'; // Default color
            const timestamp = message?.timestamp;

            return (
              <div key={index} className="chat-message">
                <div className="flex items-start space-x-3">
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    style={{ backgroundColor: userColor }}
                  >
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline space-x-2">
                      <span 
                        className="font-semibold"
                        style={{ color: userColor }}
                      >
                        {username}
                      </span>
                      <span className="text-xs text-discord-light">
                        {timestamp ? formatTime(timestamp) : 'No Time'}
                      </span>
                    </div>
                    <p className="text-white mt-1 break-words">{msgContent}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-600">
        <form onSubmit={handleSubmit}>
          <div className="flex space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="input-field flex-1"
              placeholder="Type a message..."
              maxLength={500}
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;
