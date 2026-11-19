WellnessXpressBrand Codex recovery bundle

Contents:
- codex-checkpoint.patch: extracted 23-file Codex diff from the supplied Codex git-apply transcript.
- src_app_admin_actions.ts.snapshot: supplied full actions.ts snapshot.
- src_lib_db.ts.snapshot: supplied full db.ts snapshot.

Important:
- The patch is based on the file revisions recorded in its Git index headers.
- Apply only in a separate recovery branch/worktree after fetching the current repository.
- First inspect with: git apply --stat codex-checkpoint.patch
- Test applicability with: git apply --check --3way codex-checkpoint.patch
- Do not apply directly to main.
- Resolve overlapping Claude changes and SQLite migration ordering before merging.
- Do not deploy to production.
- This bundle does not prove the patch applies cleanly to the current remote branch.
