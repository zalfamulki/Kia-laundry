/**
 * KIA LAUNDRY — Modul Kamera & Kompresi Foto
 * Mendukung kamera langsung (webcam/HP via getUserMedia),
 * fallback upload kamera bawaan HP (capture="environment"),
 * dan kompresi kanvas otomatis (target ~720px, JPEG quality ~0.65, thumbnail ~180px).
 */

class KameraManager {
  constructor() {
    this.stream = null;
    this.videoElement = null;
  }

  // Kompres file gambar atau dataURL via Canvas
  static async compressImage(sourceFileOrDataUrl, maxDim = 720, quality = 0.65) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Hitung rasio resize
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        // 1. Gambar utama (~720px)
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);

        // 2. Thumbnail (~180px)
        const thumbDim = 180;
        let thumbW = img.width;
        let thumbH = img.height;
        if (thumbW > thumbH) {
          if (thumbW > thumbDim) {
            thumbH = Math.round((thumbH * thumbDim) / thumbW);
            thumbW = thumbDim;
          }
        } else {
          if (thumbH > thumbDim) {
            thumbW = Math.round((thumbW * thumbDim) / thumbH);
            thumbH = thumbDim;
          }
        }

        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = thumbW;
        thumbCanvas.height = thumbH;
        const thumbCtx = thumbCanvas.getContext("2d");
        thumbCtx.drawImage(img, 0, 0, thumbW, thumbH);

        const thumbDataUrl = thumbCanvas.toDataURL("image/jpeg", 0.6);

        // Hitung perkiraan ukuran KB
        const head = "data:image/jpeg;base64,";
        const base64Str = compressedDataUrl.substring(head.length);
        const sizeInBytes = Math.round((base64Str.length * 3) / 4);
        const sizeKb = Math.round(sizeInBytes / 1024);

        resolve({
          foto: compressedDataUrl,
          fotoThumb: thumbDataUrl,
          sizeKb: sizeKb
        });
      };

      img.onerror = (err) => reject(err);

      if (typeof sourceFileOrDataUrl === "string") {
        img.src = sourceFileOrDataUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => (img.src = e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(sourceFileOrDataUrl);
      }
    });
  }

  // Buka stream webcam/kamera HP langsung
  async startCamera(videoElement, facingMode = "environment") {
    this.videoElement = videoElement;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Kamera langsung tidak didukung browser ini atau memerlukan HTTPS / Localhost.");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }
      return true;
    } catch (err) {
      console.warn("Gagal membuka kamera langsung:", err);
      throw err;
    }
  }

  // Ambil snapshot frame saat ini dari video
  async captureFrame() {
    if (!this.videoElement || !this.stream) {
      throw new Error("Kamera belum aktif.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = this.videoElement.videoWidth || 640;
    canvas.height = this.videoElement.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

    const frameData = canvas.toDataURL("image/jpeg", 0.9);
    return await KameraManager.compressImage(frameData);
  }

  // Hentikan stream kamera
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }
}
