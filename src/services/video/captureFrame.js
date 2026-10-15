/**
 * @file The current frame of a <video> as a JPEG picture — how a step's
 * screenshot is taken from a recording ("Create by video", and choosing
 * another moment for a step in the preview studio).
 */

const FRAME_QUALITY = 0.92;

/**
 * The current video frame as a JPEG Blob (natural size).
 * @param {HTMLVideoElement} video
 * @returns {Promise<Blob>}
 */
export function captureFrame(video) {
  return new Promise((resolve, reject) => {
    const { videoWidth: w, videoHeight: h } = video;
    if (!w || !h) {
      reject(new Error('Video not ready'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Capture failed'))),
      'image/jpeg',
      FRAME_QUALITY,
    );
  });
}
