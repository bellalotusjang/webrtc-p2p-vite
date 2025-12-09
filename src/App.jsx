import { useState, useEffect, useRef } from "react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Send,
  Download,
} from "lucide-react";
import "./App.css";
import SignalingService from "./services/SignalingService.js";
import WebRTCService from "./services/WebRTCService.js";
import MediaService from "./services/MediaService.js";
import FileTransferService from "./services/FileTransferService.js";

function App() {
  const [isInCall, setIsInCall] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [dataChannelStatus, setDataChannelStatus] = useState("closed");
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [receivedFiles, setReceivedFiles] = useState([]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const signalingRef = useRef(null);
  const webrtcRef = useRef(null);
  const mediaServiceRef = useRef(null);
  const fileServiceRef = useRef(null);
  const localStreamRef = useRef(null); // Store stream in ref for immediate access
  const remoteTracksRef = useRef(new Map()); // Track all remote tracks by ID

  useEffect(() => {
    signalingRef.current = new SignalingService();
    mediaServiceRef.current = new MediaService();

    signalingRef.current.connect();

    setupSignalingListeners();

    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localStreamRef.current = localStream; // Keep ref in sync
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    const videoElement = remoteVideoRef.current;
    if (!videoElement) return;

    if (remoteStream) {
      console.log("📹 Setting remote stream to video element");
      console.log("📹 Stream ID:", remoteStream.id);
      console.log(
        "📹 Stream tracks:",
        remoteStream.getTracks().map((t) => ({
          kind: t.kind,
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
        }))
      );

      // Only update if the stream is different
      if (videoElement.srcObject !== remoteStream) {
        console.log("📹 Updating video element srcObject");
        videoElement.srcObject = remoteStream;
      }

      // Ensure video plays - use load() to force reload
      const playVideo = async () => {
        try {
          videoElement.load(); // Force reload
          await videoElement.play();
          console.log("✅ Remote video started playing");
        } catch (err) {
          console.error("❌ Remote video play failed:", err);
          // Retry after a short delay
          setTimeout(async () => {
            try {
              await videoElement.play();
              console.log("✅ Remote video started playing (retry)");
            } catch (e) {
              console.error("❌ Retry play failed:", e);
            }
          }, 500);
        }
      };

      playVideo();
    } else {
      console.log("🧹 Clearing remote video element");
      videoElement.srcObject = null;
    }
  }, [remoteStream]);

  const setupSignalingListeners = () => {
    const signaling = signalingRef.current;

    signaling.on("existing-users", async (users) => {
      console.log("👥 Existing users:", users);
      // Use ref to get current stream immediately (not state which might be stale)
      const currentStream = localStreamRef.current || localStream;
      if (!currentStream) {
        console.error(
          "❌ No local stream available when seeing existing users!"
        );
        return;
      }
      for (const userId of users) {
        await createConnection(userId, true, currentStream);
      }
    });

    signaling.on("user-joined", async (userId) => {
      console.log("👤 User joined:", userId);
      // Use ref to get current stream immediately
      const currentStream = localStreamRef.current || localStream;
      if (!currentStream) {
        console.error("❌ No local stream available when user joined!");
        return;
      }
      await createConnection(userId, false, currentStream);
    });

    signaling.on("offer", async (data) => {
      console.log("📥 Offer received from:", data.from);

      // If connection doesn't exist or is for different user, create it
      if (!webrtcRef.current || webrtcRef.current.remoteId !== data.from) {
        console.log("🔧 Creating connection for offer from:", data.from);
        await createConnection(data.from, false);
      }

      // Ensure local stream is added BEFORE creating answer
      const currentStream = localStreamRef.current || localStream;
      if (webrtcRef.current && currentStream) {
        const senders = webrtcRef.current.peerConnection.getSenders();
        const hasVideoTrack = senders.some(
          (s) => s.track && s.track.kind === "video"
        );
        const hasAudioTrack = senders.some(
          (s) => s.track && s.track.kind === "audio"
        );

        if (!hasVideoTrack || !hasAudioTrack) {
          console.log("➕ Adding local stream before creating answer");
          webrtcRef.current.addStream(currentStream);
        }
      } else if (!currentStream) {
        console.error("❌ Local stream not available when receiving offer!");
      }

      if (webrtcRef.current && webrtcRef.current.remoteId === data.from) {
        console.log("📤 Creating answer for:", data.from);
        const answer = await webrtcRef.current.createAnswer(data.offer);
        signalingRef.current.sendAnswer(data.from, answer);
      }
    });

    signaling.on("answer", async (data) => {
      if (webrtcRef.current && webrtcRef.current.remoteId === data.from) {
        await webrtcRef.current.setAnswer(data.answer);
      }
    });

    signaling.on("ice-candidate", async (data) => {
      if (webrtcRef.current && webrtcRef.current.remoteId === data.from) {
        await webrtcRef.current.addIceCandidate(data.candidate);
      }
    });

    signaling.on("user-left", () => {
      setRemoteStream(null);
      setConnectionStatus("disconnected");
    });
  };

  const createConnection = async (
    remoteId,
    isInitiator,
    streamToUse = null
  ) => {
    console.log(
      `🔗 Creating connection: remoteId=${remoteId}, isInitiator=${isInitiator}`
    );

    // Close existing connection if it exists for a different remote user
    if (webrtcRef.current && webrtcRef.current.remoteId !== remoteId) {
      console.log("🔄 Closing existing connection for different user");
      webrtcRef.current.close();
      setRemoteStream(null); // Clear remote stream when closing connection
    }

    const webrtc = new WebRTCService(remoteId, signalingRef.current);
    webrtcRef.current = webrtc;

    // Always add local stream if available BEFORE any SDP exchange
    // Use provided stream, or ref, or state (in that order)
    const stream = streamToUse || localStreamRef.current || localStream;
    if (stream) {
      console.log("➕ Adding local stream to new connection");
      webrtc.addStream(stream);
    } else {
      console.warn("⚠️ Local stream not available when creating connection");
    }

    // Clear remote tracks when creating new connection
    remoteTracksRef.current.clear();

    webrtc.on("remotestream", (stream) => {
      console.log("📹 Remote stream event received, stream ID:", stream.id);
      console.log(
        "📹 Stream tracks:",
        stream.getTracks().map((t) => ({
          kind: t.kind,
          id: t.id,
          enabled: t.enabled,
          readyState: t.readyState,
        }))
      );

      // Add all tracks from this stream to our collection
      stream.getTracks().forEach((track) => {
        remoteTracksRef.current.set(track.id, track);
        console.log(
          `📹 Added track to collection: ${track.kind} (${track.id})`
        );
      });

      // Create a combined stream from all collected tracks
      if (remoteTracksRef.current.size > 0) {
        const combinedStream = new MediaStream(
          Array.from(remoteTracksRef.current.values())
        );
        console.log(
          "📹 Combined stream created with",
          combinedStream.getTracks().length,
          "tracks"
        );
        console.log(
          "📹 Combined stream tracks:",
          combinedStream.getTracks().map((t) => t.kind)
        );
        setRemoteStream(combinedStream);
      }
    });

    webrtc.on("connectionstatechange", (state) => {
      console.log("🔗 Connection state changed:", state);
      setConnectionStatus(state);
    });

    webrtc.on("datachannelopen", () => {
      setDataChannelStatus("open");
      fileServiceRef.current = new FileTransferService(webrtc);
      setupFileTransferListeners();
    });

    webrtc.on("datachannelclose", () => {
      setDataChannelStatus("closed");
    });

    if (isInitiator) {
      console.log("📤 Creating offer as initiator");
      const offer = await webrtc.createOffer();
      signalingRef.current.sendOffer(remoteId, offer);
    }
  };

  const setupFileTransferListeners = () => {
    const fileService = fileServiceRef.current;

    fileService.on("sendprogress", (data) => {
      setFileProgress(data.progress);
    });

    fileService.on("sendcomplete", () => {
      setFileProgress(0);
      setSelectedFile(null);
    });

    fileService.on("receivecomplete", (file) => {
      setReceivedFiles((prev) => [...prev, file]);
    });
  };

  const handleJoinRoom = async () => {
    if (!roomId.trim()) {
      alert("방 ID를 입력하세요");
      return;
    }

    try {
      const stream = await mediaServiceRef.current.getLocalStream();
      localStreamRef.current = stream; // Set ref immediately for synchronous access
      setLocalStream(stream);
      signalingRef.current.joinRoom(roomId.trim());
      setIsInCall(true);
    } catch (error) {
      alert("카메라/마이크 권한이 필요합니다");
    }
  };

  const toggleVideo = () => {
    const enabled = mediaServiceRef.current.toggleVideo();
    setIsVideoEnabled(enabled);
  };

  const toggleAudio = () => {
    const enabled = mediaServiceRef.current.toggleAudio();
    setIsAudioEnabled(enabled);
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await mediaServiceRef.current.getScreenStream();
        const screenTrack = screenStream.getVideoTracks()[0];

        const sender = webrtcRef.current.peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");

        if (sender) {
          await sender.replaceTrack(screenTrack);
          localVideoRef.current.srcObject = screenStream;
          setIsScreenSharing(true);

          screenTrack.onended = () => stopScreenShare();
        }
      } catch (error) {
        console.error("화면 공유 실패:", error);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = async () => {
    const videoTrack = mediaServiceRef.current.localStream.getVideoTracks()[0];
    const sender = webrtcRef.current.peerConnection
      .getSenders()
      .find((s) => s.track && s.track.kind === "video");

    if (sender && videoTrack) {
      await sender.replaceTrack(videoTrack);
      localVideoRef.current.srcObject = mediaServiceRef.current.localStream;
      setIsScreenSharing(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const sendFile = async () => {
    if (selectedFile && fileServiceRef.current) {
      await fileServiceRef.current.sendFile(selectedFile);
    }
  };

  const downloadFile = (file) => {
    fileServiceRef.current.downloadFile(file);
  };

  const hangup = () => {
    // 현재 참여 중인 방에서 정상적으로 나가기
    if (signalingRef.current) {
      signalingRef.current.leaveRoom();
    }

    cleanup();
    setIsInCall(false);
    setRoomId("");
  };

  const cleanup = () => {
    if (webrtcRef.current) {
      webrtcRef.current.close();
    }
    if (localStream) {
      mediaServiceRef.current.stopStream(localStream);
    }
    setLocalStream(null);
    setRemoteStream(null);
    setConnectionStatus("disconnected");
    setDataChannelStatus("closed");
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (!isInCall) {
    return (
      <div className="container fade-in">
        <div className="lobby">
          <div className="logo">
            <Video size={48} />
          </div>
          <h1>WebRTC P2P 화상 통화</h1>
          <p className="subtitle">실시간 영상/음성 통신 & 파일 공유</p>

          <div className="join-form">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleJoinRoom()}
              placeholder="방 ID 입력 (예: room123)"
              className="input"
            />
            <button onClick={handleJoinRoom} className="btn btn-primary">
              참가하기
            </button>
          </div>

          <div className="features">
            <div className="feature">
              <Video size={24} />
              <span>HD 화상통화</span>
            </div>
            <div className="feature">
              <Monitor size={24} />
              <span>화면 공유</span>
            </div>
            <div className="feature">
              <Send size={24} />
              <span>파일 전송</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container fade-in">
      <div className="call-screen">
        <div className="header">
          <h2>방: {roomId}</h2>
          <div className="status-badges">
            <span
              className={`badge ${
                connectionStatus === "connected"
                  ? "badge-success"
                  : "badge-warning"
              }`}
            >
              {connectionStatus}
            </span>
            <span
              className={`badge ${
                dataChannelStatus === "open"
                  ? "badge-success"
                  : "badge-secondary"
              }`}
            >
              데이터: {dataChannelStatus}
            </span>
          </div>
        </div>

        <div className="video-grid">
          <div className="video-wrapper">
            <video ref={localVideoRef} autoPlay muted playsInline />
            <div className="video-label">나</div>
          </div>
          <div className="video-wrapper">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              key={
                remoteStream ? `remote-${remoteStream.id}` : "remote-waiting"
              }
            />
            <div className="video-label">
              {remoteStream ? "상대방" : "연결 대기 중..."}
            </div>
          </div>
        </div>

        <div className="controls">
          <button
            onClick={toggleVideo}
            className={`control-btn ${!isVideoEnabled ? "active" : ""}`}
          >
            {isVideoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button
            onClick={toggleAudio}
            className={`control-btn ${!isAudioEnabled ? "active" : ""}`}
          >
            {isAudioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button
            onClick={toggleScreenShare}
            className={`control-btn ${isScreenSharing ? "active" : ""}`}
          >
            <Monitor size={20} />
          </button>
          <button onClick={hangup} className="control-btn btn-danger">
            <PhoneOff size={20} />
          </button>
        </div>

        <div className="file-section">
          <h3>파일 전송</h3>
          <div className="file-upload">
            <input
              type="file"
              onChange={handleFileSelect}
              id="fileInput"
              style={{ display: "none" }}
            />
            <label htmlFor="fileInput" className="btn btn-secondary">
              파일 선택
            </label>
            {selectedFile && (
              <div className="file-info">
                <span>{selectedFile.name}</span>
                <span className="file-size">
                  {formatFileSize(selectedFile.size)}
                </span>
                <button onClick={sendFile} className="btn btn-primary btn-sm">
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>

          {fileProgress > 0 && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${fileProgress}%` }}
              />
              <span className="progress-text">{Math.round(fileProgress)}%</span>
            </div>
          )}

          {receivedFiles.length > 0 && (
            <div className="received-files">
              <h4>수신된 파일</h4>
              {receivedFiles.map((file, index) => (
                <div key={index} className="file-item">
                  <div>
                    <div className="file-name">{file.name}</div>
                    <div className="file-size">{formatFileSize(file.size)}</div>
                  </div>
                  <button
                    onClick={() => downloadFile(file)}
                    className="btn btn-sm"
                  >
                    <Download size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
