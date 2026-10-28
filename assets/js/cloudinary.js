const cloudinaryConfig = {
  cloudName: "c3dbdnun",
  unsignedUploadPreset: "sudheera"
};

export async function uploadEventCover(file) {
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
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudinaryConfig.cloudName)}/image/upload`, {
    method: "POST",
    body: formData
  });
  const result = await response.json();
  if (!response.ok) {
    const message = result && typeof result === "object" ? result.error?.message : "";
    throw new Error(message || `Cloudinary upload failed (${response.status}).`);
  }
  if (!result || typeof result.secure_url !== "string" || !result.secure_url.startsWith("https://")
    || typeof result.public_id !== "string" || !result.public_id) {
    throw new Error("Cloudinary returned an invalid event cover.");
  }
  return { url: result.secure_url, publicId: result.public_id };
}
