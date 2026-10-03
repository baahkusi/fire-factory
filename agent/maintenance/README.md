# Maintenance

Enter only when the human says the project is in maintenance. Do not switch
because the plan looks finished.

| Build (`PLAN.md`) | Maintenance (this folder) |
|-------------------|---------------------------|
| Ordered steps to ship the product | One request at a time |
| `implementation/NN-*.md` | `YYYY-MM-DD_slug.md` |

## Each request

1. Copy `_TEMPLATE.md` to `YYYY-MM-DD_short-slug.md`.
2. If the change alters product meaning, update the SPEC first and let the
   human review it.
3. Implement. Add tests.
4. Refresh the README layout if the tree changed.
5. When the human marks the request done, reconcile `INVARIANTS.md` once.
6. Run invariants only if asked.
7. Leave the file in place. Do not overwrite old requests.
