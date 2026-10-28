const cloudinaryConfig = {
  cloudName: "c3dbdnun",
  unsignedUploadPreset: "sudheera"
};

export function uploadEventCover(file, onProgress = () => {}) {
  if (!cloudinaryConfig.cloudName || !cloudinaryConfig.unsignedUploadPreset) {
    throw new Error("Cloudinary is not configured. Add the Cloud name and unsigned upload preset in assets/js/cloudinary.js.");
  }
  if (!file || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("Images must be smaller than 8 MB.");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cloudinaryConfig.unsignedUploadPreset);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/image/upload`);
    request.timeout = 45000;
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("timeout", () => reject(new Error("Cloudinary upload timed out after 45 seconds. Check your connection and try again.")));
    request.addEventListener("error", () => reject(new Error("Could not reach Cloudinary. Check your connection and Cloudinary upload settings.")));
    request.addEventListener("load", () => {
      let result;
      try { result = JSON.parse(request.responseText); }
      catch { reject(new Error("Cloudinary returned an unreadable response. Check the upload preset and try again.")); return; }
      if (request.status < 200 || request.status >= 300) {
        const message = result && typeof result === "object" ? result.error?.message : "";
        reject(new Error(message || `Cloudinary upload failed (${request.status}).`));
        return;
      }
      if (!result || typeof result.secure_url !== "string" || !result.secure_url.startsWith("https://")
        || typeof result.public_id !== "string" || !result.public_id) {
        reject(new Error("Cloudinary returned an invalid event cover."));
        return;
      }
      resolve({ url: result.secure_url, publicId: result.public_id });
    });
    request.send(formData);
  });
}
