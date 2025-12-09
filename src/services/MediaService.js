class MediaService {
  constructor() {
    this.localStream = null;
    this.screenStream = null;
    this.isVideoEnabled = true;
    this.isAudioEnabled = true;
  }

  async getLocalStream(constraints = { video: true, audio: true }) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ 로컬 스트림 획득");
      return this.localStream;
    } catch (error) {
      console.error("❌ 미디어 접근 실패:", error);
      throw error;
    }
  }

  async getScreenStream() {
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      console.log("✅ 화면 공유 스트림 획득");
      return this.screenStream;
    } catch (error) {
      console.error("❌ 화면 공유 실패:", error);
      throw error;
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        this.isVideoEnabled = !this.isVideoEnabled;
        videoTrack.enabled = this.isVideoEnabled;
        return this.isVideoEnabled;
      }
    }
    return false;
  }

  toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        this.isAudioEnabled = !this.isAudioEnabled;
        audioTrack.enabled = this.isAudioEnabled;
        return this.isAudioEnabled;
      }
    }
    return false;
  }

  stopStream(stream) {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  stopAllStreams() {
    this.stopStream(this.localStream);
    this.stopStream(this.screenStream);
    this.localStream = null;
    this.screenStream = null;
  }
}

export default MediaService;
