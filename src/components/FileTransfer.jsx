class FileTransferService {
  constructor(webrtcService) {
    this.connection = webrtcService;
    this.CHUNK_SIZE = 16384;
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

  async sendFile(file) {
    const metadata = {
      type: "file-metadata",
      name: file.name,
      size: file.size,
      mimeType: file.type,
      timestamp: Date.now(),
    };

    this.connection.sendData(JSON.stringify(metadata));
    console.log("📤 파일 메타데이터 전송:", metadata);
    this.sendStartTime = Date.now();

    let offset = 0;
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    let chunkIndex = 0;

    const sendNextChunk = async () => {
      if (offset >= file.size) {
        const endMessage = JSON.stringify({ type: "file-end" });
        this.connection.sendData(endMessage);
        console.log("✅ 파일 전송 완료");
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
        const elapsedTime = (Date.now() - this.sendStartTime) / 1000;
        const speed = offset / elapsedTime;

        this.trigger("sendprogress", {
          file: file,
          sent: offset,
          total: file.size,
          progress: progress,
          chunkIndex: chunkIndex,
          totalChunks: totalChunks,
          speed: speed,
        });

        setTimeout(sendNextChunk, 0);
      } catch (error) {
        console.error("❌ 청크 전송 실패:", error);
        this.trigger("senderror", error);
      }
    };

    sendNextChunk();
  }

  handleMessage(data) {
    if (typeof data === "string") {
      try {
        const message = JSON.parse(data);

        if (message.type === "file-metadata") {
          this.fileMetadata = message;
          this.receivedChunks = [];
          this.receivedSize = 0;
          console.log("📥 파일 수신 시작:", message);
          this.trigger("receivemetadata", message);
        } else if (message.type === "file-end") {
          this.completeFileReceive();
        }
      } catch (error) {
        console.error("메시지 파싱 실패:", error);
      }
    } else if (data instanceof ArrayBuffer) {
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

  completeFileReceive() {
    if (!this.fileMetadata || this.receivedChunks.length === 0) {
      console.error("파일 데이터 없음");
      return;
    }

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

    console.log("✅ 파일 수신 완료:", file);
    this.trigger("receivecomplete", file);

    this.receivedChunks = [];
    this.fileMetadata = null;
    this.receivedSize = 0;
  }

  downloadFile(file) {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("💾 파일 다운로드:", file.name);
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

export default FileTransferService;
