import { NextResponse } from "next/server";
import { currentAdmin, can } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveImageUpload, MAX_IMAGE_BYTES } from "@/lib/media";
import { sameOrigin } from "@/lib/ratelimit";
import { logAdminActivity } from "@/lib/admin-events";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const admin = await currentAdmin();
    if (!admin || !can(admin, "products")) {
      return NextResponse.json({ error: "Your admin session has expired or lacks product permission. Sign in again." }, { status: 401 });
    }
    const form = await request.formData();
    const productId = Number(form.get("productId"));
    const index = Number(form.get("index"));
    const file = form.get("image");
    if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "Invalid product or image position." }, { status: 400 });
    }
    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "Choose the replacement image first." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image must be 6 MB or smaller." }, { status: 413 });
    }
    const product = db().prepare("SELECT images FROM products WHERE id = ?").get(productId);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    let images: string[];
    try { images = JSON.parse(String(product.images || "[]")); } catch { return NextResponse.json({ error: "Product gallery data is invalid." }, { status: 500 }); }
    if (!Array.isArray(images) || index >= images.length || typeof images[index] !== "string") return NextResponse.json({ error: "That photo no longer exists. Refresh the product page." }, { status: 409 });
    const uploaded = await saveImageUpload(file, admin.email);
    if (uploaded.error || !uploaded.media) return NextResponse.json({ error: uploaded.error || "Image upload failed." }, { status: 400 });
    const previous = images[index];
    images[index] = uploaded.media.url;
    db().prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(images), productId);
    revalidatePath("/", "layout");
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}`);
    logAdminActivity(admin.email, "product_image_replaced", "product", productId, `Photo ${index + 1} replaced: ${previous}`);
    return NextResponse.json({ ok: true, message: "Image replaced successfully." });
  } catch (error) {
    console.error("Product image replacement failed:", error);
    return NextResponse.json({ error: "Image replacement failed on the server. Check application logs." }, { status: 500 });
  }
}
