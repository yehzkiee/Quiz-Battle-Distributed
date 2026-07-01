function defaultSignalingUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return protocol + '//' + window.location.host + '/ws/signaling';
}

const signalingUrl = import.meta.env.VITE_SIGNALING_URL || defaultSignalingUrl();

export function connectSignaling({ roomId, userId, onMessage, onOpen, onClose }) {
  const socket = new WebSocket(signalingUrl);

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'join-room', roomId, userId }));
    onOpen?.(socket);
  });

  socket.addEventListener('message', (event) => {
    try {
      onMessage?.(JSON.parse(event.data), socket);
    } catch {
      onMessage?.({ type: 'error', message: 'invalid signaling payload' }, socket);
    }
  });

  socket.addEventListener('close', () => onClose?.());
  return socket;
}

export function sendSignal(socket, payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}
