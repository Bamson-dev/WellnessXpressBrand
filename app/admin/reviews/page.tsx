import { can, requirePerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { moderateReviewAction, saveTestimonialAction, toggleTestimonialAction } from "@/app/admin/actions";
import AdminForm from "@/components/admin/AdminForm";

export const metadata = { title: "Reviews and testimonials" };

export default async function ReviewsPage() {
  const admin = await requirePerm("reviews");
  const reviews = db().prepare(`SELECT r.*,p.name product_name,o.number order_number FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN orders o ON o.id=r.order_id ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 300`).all();
  const testimonials = can(admin, "reviews") ? db().prepare("SELECT * FROM testimonials ORDER BY id DESC LIMIT 200").all() : [];
  return <div className="space-y-10">
    <section><h1 className="text-2xl">Reviews</h1><p className="mt-1 text-sm text-neutral-600">Only reviews matched to a paid order are accepted. New submissions stay private until approved.</p>
      <div className="mt-4 grid gap-3">{reviews.length ? reviews.map((r) => <article key={String(r.id)} className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{String(r.product_name)} · {Number(r.rating)}/5</h2><p className="text-sm text-neutral-500">{String(r.customer_name)} · verified order {String(r.order_number)} · {String(r.created_at)}</p></div><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs">{String(r.status)}</span></div>
        <p className="mt-3 whitespace-pre-line text-sm">{String(r.review_text)}</p>
        <div className="mt-3 flex flex-wrap gap-2"><AdminForm action={moderateReviewAction}><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="status" value="approved" /><button className="admin-btn">Approve</button></AdminForm><AdminForm action={moderateReviewAction}><input type="hidden" name="id" value={String(r.id)} /><input type="hidden" name="status" value="rejected" /><button className="admin-btn-ghost">Reject / hide</button></AdminForm></div>
      </article>) : <p className="rounded-xl border bg-white p-5 text-sm text-neutral-500">No submitted reviews.</p>}</div>
    </section>
    {can(admin, "reviews") ? <section><h2 className="text-2xl">Testimonials</h2><p className="mt-1 text-sm text-neutral-600">Add only customer statements you have permission to publish. Drafts are not shown on the store.</p>
      <AdminForm action={saveTestimonialAction} className="mt-4 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2"><label className="text-sm">Customer name<input required name="customerName" minLength={2} maxLength={80} className="admin-input mt-1" /></label><label className="text-sm sm:col-span-2">Customer statement<textarea required name="quote" minLength={10} maxLength={1000} rows={3} className="admin-input mt-1" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="approved" /> Publish after saving</label><button className="admin-btn w-fit">Add testimonial</button></AdminForm>
      <div className="mt-3 grid gap-3">{testimonials.map((t) => <article key={String(t.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><p className="font-semibold">{String(t.customer_name)} <span className="ml-2 text-xs text-neutral-500">{Number(t.approved) ? "Published" : "Draft"}</span></p><p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{String(t.quote)}</p></div><AdminForm action={toggleTestimonialAction}><input type="hidden" name="id" value={String(t.id)} /><button className="admin-btn-ghost">{Number(t.approved) ? "Unpublish" : "Publish"}</button></AdminForm></article>)}</div>
    </section> : null}
  </div>;
}
