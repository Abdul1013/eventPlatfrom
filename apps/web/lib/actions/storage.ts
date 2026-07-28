"use server";

import { v2 as cloudinary } from "cloudinary";
import { getSession } from "@/lib/actions/auth";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const FOLDER = "eventmerge/banners";

let configured = false;
function ensureCloudinary(): boolean {
  if (configured) return true;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) return false;
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
  return true;
}

/**
 * Upload an event banner to Cloudinary. Banners are optional — if Cloudinary
 * isn't configured, returns a clear error rather than throwing.
 */
export async function uploadEventBanner(
  file: File
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { success: false, error: "Only PNG and JPG files are allowed" };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "File size must not exceed 5MB" };
    }
    if (!ensureCloudinary()) {
      return { success: false, error: "Image uploads are not configured" };
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const url = await new Promise<string>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder: FOLDER, resource_type: "image", public_id: `${session.user.id}-${Date.now()}` },
          (error, result) => {
            if (error || !result) return reject(error ?? new Error("Upload failed"));
            resolve(result.secure_url);
          }
        )
        .end(buffer);
    });

    return { success: true, url };
  } catch (error) {
    console.error("[uploadEventBanner]", error);
    return { success: false, error: "Failed to upload banner" };
  }
}

/**
 * Delete an event banner by its Cloudinary URL.
 */
export async function deleteEventBanner(
  bannerUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session) return { success: false, error: "Not authenticated" };
    if (!ensureCloudinary()) return { success: false, error: "Image uploads are not configured" };

    // Derive the public_id (…/<folder>/<public_id>.<ext>) from the URL.
    const match = bannerUrl.match(/\/([^/]+\/[^/]+)\.[a-zA-Z0-9]+$/);
    const publicId = match?.[1];
    if (!publicId) return { success: false, error: "Invalid banner URL" };

    await cloudinary.uploader.destroy(publicId);
    return { success: true };
  } catch (error) {
    console.error("[deleteEventBanner]", error);
    return { success: false, error: "Failed to delete banner" };
  }
}
