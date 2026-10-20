// Records the post-processed canvas plus the song into a video file.

export function pickMime() {
  const opts = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return opts.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

export class Recorder {
  constructor(canvas, audioStream) {
    this.canvas = canvas;
    this.audioStream = audioStream;
    this.chunks = [];
    this.rec = null;
  }

  start(fps = 60, bitrate = 16e6) {
    const stream = this.canvas.captureStream(fps);
    for (const tr of this.audioStream.getAudioTracks()) stream.addTrack(tr);
    this.mime = pickMime();
    this.rec = new MediaRecorder(stream, { mimeType: this.mime || undefined, videoBitsPerSecond: bitrate, audioBitsPerSecond: 256000 });
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.rec || this.rec.state === 'inactive') return resolve(null);
      this.rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mime || 'video/webm' }));
      this.rec.stop();
    });
  }

  get extension() {
    return (this.mime || '').includes('mp4') ? 'mp4' : 'webm';
  }
}
