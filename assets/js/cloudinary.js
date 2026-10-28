const cloudinaryConfig = {
  cloudName: "c3dbdnun",
  unsignedUploadPreset: "sudheera"
};

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const videoTypes = ["video/mp4", "video/webm", "video/quicktime"];

export function uploadCloudinaryAsset(file, { onProgress = () => {} } = {}) {
  if (!cloudinaryConfig.cloudName || !cloudinaryConfig.unsignedUploadPreset) {
    throw new Error("Cloudinary is not configured. Add the Cloud name and unsigned upload preset in assets/js/cloudinary.js.");
  }
  if (!file) throw new Error("Choose a file to upload.");
  const resourceType = imageTypes.includes(file.type) ? "image" : videoTypes.includes(file.type) ? "video" : "";
  if (!resourceType) throw new Error("Choose a JPG, PNG, WebP, GIF, MP4, WebM, or MOV file.");
  const maxBytes = resourceType === "image" ? 8 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error(resourceType === "image"
    ? "Images must be smaller than 8 MB."
    : "Videos must be smaller than 50 MB.");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cloudinaryConfig.unsignedUploadPreset);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/auto/upload`);
    request.timeout = resourceType === "video" ? 120000 : 45000;
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("timeout", () => reject(new Error(`Cloudinary ${resourceType} upload timed out. Check your connection and try again.`)));
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
        || typeof result.public_id !== "string" || !result.public_id
        || result.resource_type !== resourceType) {
        reject(new Error("Cloudinary returned invalid media metadata."));
        return;
      }
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
        resourceType,
        format: typeof result.format === "string" ? result.format : "",
        bytes: Number.isFinite(result.bytes) ? result.bytes : file.size
      });
    });
    request.send(formData);
  });
}

export function uploadCloudinaryImage(file, onProgress = () => {}) {
  return uploadCloudinaryAsset(file, { onProgress });
}

export function uploadEventCover(file, onProgress = () => {}) {
  return uploadCloudinaryAsset(file, { onProgress });
}
