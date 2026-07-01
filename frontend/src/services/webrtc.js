export function createPeer({ initiator, onSignal, onData, onOpen }) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  let channel = null;

  function bindChannel(dataChannel) {
    channel = dataChannel;
    channel.addEventListener('open', () => onOpen?.(channel));
    channel.addEventListener('message', (event) => {
      try {
        onData?.(JSON.parse(event.data));
      } catch {
        onData?.({ type: 'raw', value: event.data });
      }
    });
  }

  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) onSignal({ type: 'ice-candidate', candidate: event.candidate });
  });

  pc.addEventListener('datachannel', (event) => bindChannel(event.channel));

  if (initiator) bindChannel(pc.createDataChannel('quiz-events'));

  return {
    async createOffer() {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      onSignal({ type: 'webrtc-offer', offer });
    },
    async acceptOffer(offer) {
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onSignal({ type: 'webrtc-answer', answer });
    },
    async acceptAnswer(answer) {
      await pc.setRemoteDescription(answer);
    },
    async addCandidate(candidate) {
      if (candidate) await pc.addIceCandidate(candidate);
    },
    send(payload) {
      if (channel?.readyState === 'open') channel.send(JSON.stringify(payload));
    },
    close() {
      channel?.close();
      pc.close();
    }
  };
}
