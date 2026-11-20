import "server-only";
import { db } from "@/lib/db";

export function notifyAdmin(eventKey: string, type: string, title: string, body: string, href = "/admin") {
  db().prepare(`INSERT OR IGNORE INTO admin_notifications (event_key,type,title,body,href) VALUES (?,?,?,?,?)`)
    .run(eventKey.slice(0, 180), type.slice(0, 40), title.slice(0, 160), body.slice(0, 500), href.slice(0, 300));
}

export function logAdminActivity(actor: string, action: string, entityType: string, entityId: string | number, details = "") {
  db().prepare(`INSERT INTO admin_activity (actor,action,entity_type,entity_id,details) VALUES (?,?,?,?,?)`)
    .run(actor.slice(0, 254), action.slice(0, 80), entityType.slice(0, 80), String(entityId).slice(0, 120), details.slice(0, 800));
}
