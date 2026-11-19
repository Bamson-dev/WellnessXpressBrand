# Codex checkpoint recovery (verbatim)

Source: wellnessxpress-codex-recovery.zip supplied by the owner on 2026-11-19.

- `codex-checkpoint.patch`: 23-file Codex diff. Its base is Codex commit 277f0dc, which was never pushed to GitHub.
  Base blobs for 10 of the 11 modified files are absent from this repository, so `git apply --3way` cannot run
  (only `src/app/api/admin/export/route.ts` applies cleanly against 1a0d2d3).
- `src_app_admin_actions.ts.snapshot`, `src_lib_db.ts.snapshot`: full post-patch Codex files.

Files present in 277f0dc but absent from both this patch and GitHub (not recoverable from this bundle):
`src/lib/delivery-csv.ts`, Codex's own `src/components/RichText.tsx`, and Codex's versions of the delivery,
inventory and media admin pages and `src/lib/settings.ts`.

These files are kept unmodified as a record. The working port of the Codex features lives on the integration branch.
