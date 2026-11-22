import { NextResponse } from "next/server";
import { currentAdmin, can } from "@/lib/auth";
import { db, tx } from "@/lib/db";
import { saveImageUpload, MAX_IMAGE_BYTES } from "@/lib/media";
import { logAdminActivity } from "@/lib/admin-events";
import { revalidatePath } from "next/cache";
import { sameOrigin } from "@/lib/ratelimit";

export const runtime = "nodejs";

const MAX_FILES = 4;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const admin = await currentAdmin();
    if (!admin || !can(admin, "products")) return NextResponse.json({ error: "Your admin session has expired or lacks product permission. Sign in again." }, { status: 401 });

    const form = await request.formData();
    const productId = Number(form.get("productId"));
    const files = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);
    if (!Number.isSafeInteger(productId) || productId < 1) return NextResponse.json({ error: "Invalid product." }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: "Choose at least one image." }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `Upload a maximum of ${MAX_FILES} images at once.` }, { status: 400 });
    if (files.some((file) => file.size > MAX_IMAGE_BYTES)) return NextResponse.json({ error: "Each image must be 6 MB or smaller." }, { status: 413 });
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) return NextResponse.json({ error: "The combined upload must be 24 MB or smaller." }, { status: 413 });

    const product = db().prepare("SELECT images FROM products WHERE id = ?").get(productId);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    let images: string[];
    try {
      const parsed = JSON.parse(String(product.images || "[]"));
      if (!Array.isArray(parsed)) throw new Error("not an array");
      images = parsed.filter((item): item is string => typeof item === "string");
    } catch {
      return NextResponse.json({ error: "Product gallery data is invalid. Please contact support." }, { status: 500 });
    }

    const added: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      const result = await saveImageUpload(file, admin.email);
      if (result.error || !result.media) errors.push(result.error || "An image failed to upload.");
      else added.push(result.media.url);
    }
    if (!added.length) return NextResponse.json({ error: errors.join(" ") || "Upload failed." }, { status: 400 });

    tx((d) => d.prepare("UPDATE products SET images = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify([...images, ...added]), productId));
    revalidatePath("/", "layout");
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}`);
    logAdminActivity(admin.email, "product_images_uploaded", "product", productId, `${added.length} image(s) uploaded`);
    return NextResponse.json({ ok: true, count: added.length, message: errors.length ? `${added.length} image(s) uploaded. ${errors.join(" ")} ` : `${added.length} image(s) uploaded.` });
  } catch (error) {
    console.error("Product image upload endpoint failed:", error);
    return NextResponse.json({ error: "Upload failed on the server. Check application logs." }, { status: 500 });
  }
}