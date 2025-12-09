import FileTransferService from "../components/FileTransfer";

// 파일 전송 관리
export class FileTransferManager {
  constructor(webrtcConnection) {
    this.screenStream = null;
    this.connection = webrtcConnection;
    this.CHUNK_SIZE = 16384; // 16KB 청크
    this.receivedChunks = [];
    this.fileMetadata = null;
    this.receivedSize = 0;
    this.callbacks = {};
    this.sendStartTime = null;

    this.setupMessageHandler();
  }

  setupMessageHandler() {
    this.connection.on("datachannelmessage", (data) => {
      this.handleMessage(data);
    });
  }

  // 파일 전송 시작
  async sendFile(file) {
    const metadata = {
      type: "file-metadata",
      name: file.name,
      size: file.size,
      mimeType: file.type,
      timestamp: Date.now(),
    };

    // 메타데이터 전송
    this.connection.sendData(JSON.stringify(metadata));
    console.log("파일 메타데이터 전송:", metadata);

    this.sendStartTime = Date.now();

    // 파일을 청크로 분할하여 전송
    let offset = 0;
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    let chunkIndex = 0;

    const sendNextChunk = async () => {
      if (offset >= file.size) {
        // 전송 완료
        const endMessage = JSON.stringify({ type: "file-end" });
        this.connection.sendData(endMessage);
        console.log("파일 전송 완료");
        this.trigger("sendcomplete", file);
        return;
      }

      const chunk = file.slice(offset, offset + this.CHUNK_SIZE);
      const arrayBuffer = await chunk.arrayBuffer();

      try {
        this.connection.sendData(arrayBuffer);

        offset += this.CHUNK_SIZE;
        chunkIndex++;

        const progress = Math.min((offset / file.size) * 100, 100);
        const elapsedTime = (Date.now() - this.sendStartTime) / 1000; // 초 단위
        const speed = offset / elapsedTime; // bytes per second

        this.trigger("sendprogress", {
          file: file,
          sent: offset,
          total: file.size,
          progress: progress,
          chunkIndex: chunkIndex,
          totalChunks: totalChunks,
          speed: speed,
        });

        // 다음 청크 전송 (약간의 지연을 두어 버퍼 오버플로우 방지)
        setTimeout(sendNextChunk, 0);
      } catch (error) {
        console.error("청크 전송 실패:", error);
        this.trigger("senderror", error);
      }
    };

    sendNextChunk();
  }

  // 메시지 처리
  handleMessage(data) {
    // 문자열 메시지 (메타데이터 또는 제어 메시지)
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data);

        if (message.type === "file-metadata") {
          // 파일 수신 시작
          this.fileMetadata = message;
          this.receivedChunks = [];
          this.receivedSize = 0;
          console.log("파일 수신 시작:", message);
          this.trigger("receivemetadata", message);
        } else if (message.type === "file-end") {
          // 파일 수신 완료
          this.completeFileReceive();
        }
      } catch (error) {
        console.error("메시지 파싱 실패:", error);
      }
    }
    // 바이너리 데이터 (파일 청크)
    else if (data instanceof ArrayBuffer) {
      this.receivedChunks.push(data);
      this.receivedSize += data.byteLength;

      if (this.fileMetadata) {
        const progress = Math.min(
          (this.receivedSize / this.fileMetadata.size) * 100,
          100
        );
        this.trigger("receiveprogress", {
          received: this.receivedSize,
          total: this.fileMetadata.size,
          progress: progress,
        });
      }
    }
  }

  // 파일 수신 완료
  completeFileReceive() {
    if (!this.fileMetadata || this.receivedChunks.length === 0) {
      console.error("파일 데이터 없음");
      return;
    }

    // 모든 청크를 하나의 Blob으로 결합
    const blob = new Blob(this.receivedChunks, {
      type: this.fileMetadata.mimeType,
    });

    const file = {
      name: this.fileMetadata.name,
      size: this.fileMetadata.size,
      type: this.fileMetadata.mimeType,
      blob: blob,
      timestamp: this.fileMetadata.timestamp,
    };

    console.log("파일 수신 완료:", file);
    this.trigger("receivecomplete", file);

    // 리셋
    this.receivedChunks = [];
    this.fileMetadata = null;
    this.receivedSize = 0;
  }

  // 파일 다운로드
  downloadFile(file) {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("파일 다운로드:", file.name);
  }

  // 파일 크기 포맷팅
  static formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // 전송 속도 포맷팅
  static formatSpeed(bytesPerSecond) {
    return this.formatFileSize(bytesPerSecond) + "/s";
  }

  // 이벤트 리스너
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

export default FileTransferService;
