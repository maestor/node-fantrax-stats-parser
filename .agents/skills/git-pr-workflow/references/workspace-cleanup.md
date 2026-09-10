# Post-Merge Workspace Cleanup

Trust the user's statement that the working branch is merged. In the established flow (compare link and PR notes, user merges on GitHub, user asks `clean workspace`), the cleanup request is that confirmation and authorizes removing the active local branch. Do not re-check merge status or ask for confirmation again. If there is no merged-PR context, clarify before deleting a branch.

1. Check `git status --porcelain=v1 --untracked-files=all` and record `git branch --show-current` as the target. Stop if there are tracked or untracked changes, or the active branch is `main` or detached.
2. Run these commands sequentially, checking each result before continuing:

   ```sh
   git switch main
   git pull --ff-only origin main
   git branch -D -- <recorded-branch>
   ```

   If any command fails, stop and report the reason. Retain the target if switching or pulling fails. Let Git protect branches checked out in other worktrees. Do not fetch separately before the pull.
3. Check the final status and report briefly: “Updated `main`; removed local `<branch>`.”

Use `-D` because squash merging does not preserve the original branch commits in `main`'s ancestry; the user's confirmation supplies the merge context. No GitHub integration, merge-tree checks, patch comparisons, temporary worktrees, history searches, project tests, or additional review gate are needed. Never scan or delete unrelated branches, delete remote branches, stash, reset, clean, or discard work during this cleanup.
