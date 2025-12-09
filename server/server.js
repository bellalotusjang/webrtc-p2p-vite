import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Vite 기본 포트
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());

// 연결된 사용자 관리
const rooms = new Map();
const users = new Map();

io.on("connection", (socket) => {
  console.log("✅ 새로운 사용자 연결:", socket.id);

  const leaveRoom = () => {
    const userInfo = users.get(socket.id);
    if (!userInfo) return;

    const { roomId } = userInfo;

    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);

      if (rooms.get(roomId).size === 0) {
        rooms.delete(roomId);
        console.log(`🗑️  방 [${roomId}] 삭제됨 (빈 방)`);
      } else {
        socket.to(roomId).emit("user-left", socket.id);
        console.log(`📊 방 [${roomId}] 남은 인원: ${rooms.get(roomId).size}명`);
      }
    }

    users.delete(socket.id);
    socket.leave(roomId);
  };

  // 방 참가
  socket.on("join-room", (roomId) => {
    console.log(`📥 ${socket.id}가 방 [${roomId}]에 참가`);

    if (rooms.has(roomId)) {
      const existingUsers = Array.from(rooms.get(roomId));

      // 새 사용자에게 기존 사용자 목록 전송
      socket.emit("existing-users", existingUsers);

      // 기존 사용자들에게 새 사용자 알림
      existingUsers.forEach((userId) => {
        io.to(userId).emit("user-joined", socket.id);
      });

      rooms.get(roomId).add(socket.id);
    } else {
      rooms.set(roomId, new Set([socket.id]));
    }

    users.set(socket.id, { roomId });
    socket.join(roomId);

    console.log(`📊 방 [${roomId}] 현재 인원: ${rooms.get(roomId).size}명`);
  });
  // 방 나가기 (사용자가 통화 종료 버튼을 눌렀을 때)
  socket.on("leave-room", () => {
    console.log("👋 사용자가 방 나가기 요청:", socket.id);
    leaveRoom();
  });

  // WebRTC Offer 전달
  socket.on("offer", (data) => {
    console.log(`📤 Offer 전달: ${socket.id} → ${data.to}`);
    io.to(data.to).emit("offer", {
      from: socket.id,
      offer: data.offer,
    });
  });

  // WebRTC Answer 전달
  socket.on("answer", (data) => {
    console.log(`📤 Answer 전달: ${socket.id} → ${data.to}`);
    io.to(data.to).emit("answer", {
      from: socket.id,
      answer: data.answer,
    });
  });

  // ICE Candidate 전달
  socket.on("ice-candidate", (data) => {
    console.log(`🧊 ICE Candidate 전달: ${socket.id} → ${data.to}`);
    io.to(data.to).emit("ice-candidate", {
      from: socket.id,
      candidate: data.candidate,
    });
  });

  // 연결 해제
  socket.on("disconnect", () => {
    console.log("❌ 사용자 연결 해제:", socket.id);
    leaveRoom();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log("");
  console.log("🚀 ═══════════════════════════════════════");
  console.log("   WebRTC 시그널링 서버 시작!");
  console.log("═══════════════════════════════════════");
  console.log(`📡 서버 주소: http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO 활성화`);
  console.log(`⏰ 시작 시간: ${new Date().toLocaleString("ko-KR")}`);
  console.log("═══════════════════════════════════════");
  console.log("");
});
