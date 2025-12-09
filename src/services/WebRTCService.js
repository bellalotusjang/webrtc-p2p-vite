class WebRTCService {
  constructor(remoteId, signaling) {
    this.remoteId = remoteId;
    this.signaling = signaling;
    this.peerConnection = null;
    this.dataChannel = null;
    this.callbacks = {};

    this.config = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    this.initConnection();
  }

  initConnection() {
    this.peerConnection = new RTCPeerConnection(this.config);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("🧊 ICE Candidate 생성");
        this.signaling.sendIceCandidate(this.remoteId, event.candidate);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log("❄️ ICE 상태:", this.peerConnection.iceConnectionState);
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log("🔗 연결 상태:", state);
      this.trigger("connectionstatechange", state);

      // When connected, check if we have remote tracks that weren't caught by ontrack
      if (state === "connected") {
        setTimeout(() => {
          const receivers = this.peerConnection.getReceivers();
          console.log("📹 수신 중인 리시버 수:", receivers.length);
          const videoReceivers = receivers.filter(
            (r) => r.track && r.track.kind === "video"
          );
          const audioReceivers = receivers.filter(
            (r) => r.track && r.track.kind === "audio"
          );

          if (videoReceivers.length > 0 || audioReceivers.length > 0) {
            console.log(
              "📹 비디오 리시버:",
              videoReceivers.length,
              "오디오 리시버:",
              audioReceivers.length
            );
            // Create a stream from all received tracks
            const tracks = receivers
              .filter((r) => r.track && r.track.readyState === "live")
              .map((r) => r.track);

            if (tracks.length > 0) {
              const stream = new MediaStream(tracks);
              console.log(
                "📹 연결 후 수동으로 스트림 생성, 트랙 수:",
                tracks.length
              );
              this.trigger("remotestream", stream);
            }
          }
        }, 500);
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log("📹 원격 스트림 수신", event);
      console.log("📹 트랙 종류:", event.track.kind);
      console.log("📹 트랙 ID:", event.track.id);
      console.log("📹 트랙 상태:", event.track.readyState);

      if (event.streams && event.streams.length > 0) {
        const stream = event.streams[0];
        console.log("📹 스트림 ID:", stream.id);
        console.log("📹 스트림 트랙 수:", stream.getTracks().length);
        console.log(
          "📹 스트림 트랙들:",
          stream
            .getTracks()
            .map((t) => ({
              kind: t.kind,
              enabled: t.enabled,
              readyState: t.readyState,
            }))
        );
        this.trigger("remotestream", stream);
      } else {
        console.warn("⚠️ 스트림이 없는 트랙 이벤트 - 트랙만으로 스트림 생성");
        // Create a new MediaStream with the track if no stream provided
        const stream = new MediaStream([event.track]);
        this.trigger("remotestream", stream);
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      console.log("📦 데이터 채널 수신");
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };
  }

  addStream(stream) {
    if (!stream) {
      console.warn("⚠️ addStream: stream is null");
      return;
    }

    const tracks = stream.getTracks();
    console.log("➕ 스트림 추가, 트랙 수:", tracks.length);

    tracks.forEach((track) => {
      this.peerConnection.addTrack(track, stream);
      console.log(
        "➕ 트랙 추가:",
        track.kind,
        "enabled:",
        track.enabled,
        "readyState:",
        track.readyState
      );
    });

    // Verify tracks were added
    const senders = this.peerConnection.getSenders();
    console.log("📊 총 Sender 수:", senders.length);
  }

  async createOffer() {
    try {
      // Check senders before creating offer
      const senders = this.peerConnection.getSenders();
      console.log("📊 Offer 생성 전 Sender 수:", senders.length);
      senders.forEach((s, i) => {
        if (s.track) {
          console.log(
            `  Sender ${i}: ${s.track.kind}, enabled: ${s.track.enabled}, readyState: ${s.track.readyState}`
          );
        } else {
          console.log(`  Sender ${i}: no track`);
        }
      });

      if (senders.length === 0) {
        console.warn("⚠️ 경고: Offer 생성 전에 트랙이 없습니다!");
      }

      this.createDataChannel();
      const offer = await this.peerConnection.createOffer();

      // Check if offer contains media
      console.log("📤 Offer SDP 확인:");
      console.log("  - 비디오 포함:", offer.sdp.includes("m=video"));
      console.log("  - 오디오 포함:", offer.sdp.includes("m=audio"));

      await this.peerConnection.setLocalDescription(offer);
      console.log("📤 Offer 생성 완료");
      return offer;
    } catch (error) {
      console.error("❌ Offer 생성 실패:", error);
      throw error;
    }
  }

  async createAnswer(offer) {
    try {
      // IMPORTANT: Tracks must be added BEFORE setRemoteDescription
      // Check if we have any senders (tracks)
      const senders = this.peerConnection.getSenders();
      console.log("📊 Answer 생성 전 Sender 수:", senders.length);
      senders.forEach((s, i) => {
        if (s.track) {
          console.log(
            `  Sender ${i}: ${s.track.kind}, enabled: ${s.track.enabled}, readyState: ${s.track.readyState}`
          );
        } else {
          console.log(`  Sender ${i}: no track`);
        }
      });

      if (senders.length === 0) {
        console.warn("⚠️ 경고: Answer 생성 전에 트랙이 없습니다!");
      }

      // Check if offer contains media
      console.log("📥 받은 Offer SDP 확인:");
      console.log("  - 비디오 포함:", offer.sdp.includes("m=video"));
      console.log("  - 오디오 포함:", offer.sdp.includes("m=audio"));

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await this.peerConnection.createAnswer();

      // Check if answer contains media
      console.log("📤 Answer SDP 확인:");
      console.log("  - 비디오 포함:", answer.sdp.includes("m=video"));
      console.log("  - 오디오 포함:", answer.sdp.includes("m=audio"));

      await this.peerConnection.setLocalDescription(answer);
      console.log("📤 Answer 생성 완료");
      return answer;
    } catch (error) {
      console.error("❌ Answer 생성 실패:", error);
      throw error;
    }
  }

  async setAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
      console.log("✅ Answer 설정 완료");
    } catch (error) {
      console.error("❌ Answer 설정 실패:", error);
      throw error;
    }
  }

  async addIceCandidate(candidate) {
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("✅ ICE Candidate 추가");
    } catch (error) {
      console.error("❌ ICE Candidate 추가 실패:", error);
    }
  }

  createDataChannel() {
    this.dataChannel = this.peerConnection.createDataChannel("fileTransfer", {
      ordered: true,
      maxRetransmits: 30,
    });
    this.setupDataChannel();
    console.log("📦 데이터 채널 생성");
  }

  setupDataChannel() {
    this.dataChannel.onopen = () => {
      console.log("✅ 데이터 채널 열림");
      this.trigger("datachannelopen");
    };

    this.dataChannel.onclose = () => {
      console.log("❌ 데이터 채널 닫힘");
      this.trigger("datachannelclose");
    };

    this.dataChannel.onerror = (error) => {
      console.error("🔴 데이터 채널 오류:", error);
      this.trigger("datachannelerror", error);
    };

    this.dataChannel.onmessage = (event) => {
      this.trigger("datachannelmessage", event.data);
    };
  }

  sendData(data) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(data);
      return true;
    }
    return false;
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    console.log("🔌 연결 종료");
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  trigger(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach((callback) => callback(data));
    }
  }
}

export default WebRTCService;
