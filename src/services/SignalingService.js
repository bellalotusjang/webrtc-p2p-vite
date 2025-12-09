import { io } from "socket.io-client";

class SignalingService {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.localId = null;
    this.callbacks = {};
  }

  connect(serverUrl = "https://averse-estella-washed.ngrok-free.dev") {
    this.socket = io(serverUrl, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.localId = this.socket.id;

    this.socket.on("connect", () => {
      console.log("✅ 시그널링 서버 연결:", this.socket.id);
      this.localId = this.socket.id;
      this.trigger("connected", this.socket.id);
    });

    this.socket.on("existing-users", (users) => {
      console.log("👥 기존 사용자:", users);
      this.trigger("existing-users", users);
    });

    this.socket.on("user-joined", (userId) => {
      console.log("👤 새 사용자 참가:", userId);
      this.trigger("user-joined", userId);
    });

    this.socket.on("offer", (data) => {
      console.log("📥 Offer 수신:", data.from);
      this.trigger("offer", data);
    });

    this.socket.on("answer", (data) => {
      console.log("📥 Answer 수신:", data.from);
      this.trigger("answer", data);
    });

    this.socket.on("ice-candidate", (data) => {
      console.log("🧊 ICE Candidate 수신:", data.from);
      this.trigger("ice-candidate", data);
    });

    this.socket.on("user-left", (userId) => {
      console.log("👋 사용자 퇴장:", userId);
      this.trigger("user-left", userId);
    });

    this.socket.on("disconnect", () => {
      console.log("❌ 서버 연결 해제");
      this.trigger("disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("🔴 연결 오류:", error);
    });
  }

  joinRoom(roomId) {
    this.roomId = roomId;
    this.socket.emit("join-room", roomId);
  }

  leaveRoom() {
    if (this.socket && this.roomId) {
      this.socket.emit("leave-room", this.roomId);
      this.roomId = null;
    }
  }

  sendOffer(to, offer) {
    this.socket.emit("offer", { to, offer });
  }

  sendAnswer(to, answer) {
    this.socket.emit("answer", { to, answer });
  }

  sendIceCandidate(to, candidate) {
    this.socket.emit("ice-candidate", { to, candidate });
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

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export default SignalingService;
