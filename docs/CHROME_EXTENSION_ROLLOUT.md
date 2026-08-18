# Chrome Extension Rollout Rules (Archived Web Store Plan)

The current rollout is local and unpacked. Use `docs/LOCAL_DEPLOYMENT.md`; this older Web Store plan is retained only for historical context.

GLDN Ops should be treated as a normal Chrome Web Store extension first. Windows scripts are allowed only as optional setup or diagnostic tools, not as required runtime pieces.

## Must Be True For Chrome Extension Builds

1. The extension must not require any external Windows click service.
2. The manifest must not request localhost host permissions for normal operation.
3. The manifest must not request `management` unless there is a reviewed Chrome Store reason.
4. EcomSniper workflows must use the semantic in-page `Extract Sellers` control on eBay and require `after total - before total = reported new` before continuing.
5. Dashboard sync must use the built-in Apps Script web app connection.
6. The popup must show `Automatic` EcomSniper mode and explain that no local helper is required.
7. The popup must be able to copy a full diagnostic report before reset/reinstall.
8. The popup must preserve per-profile settings through copy/restore backup.
9. Web Store packages must not include the private dashboard setup code.
10. Web Store packages must be built with `tools/build-webstore-zip.ps1`.

## EcomSniper Rule

GLDN Ops does not replace EcomSniper. It opens the right page, prepares context, automatically clicks EcomSniper **Extract Sellers** on the shared eBay page, and continues only after EcomSniper updates its own count.

Normal flow:

1. GLDN Ops opens Amazon or eBay context.
2. GLDN Ops opens the EcomSniper page by configured extension ID.
3. GLDN Ops finds the visible EcomSniper **Extract Sellers** button by semantic label and clicks it.
4. GLDN Ops confirms the button's before total, after total, and new count reconcile exactly before continuing.
5. GLDN Ops reports each extraction step separately from the complete multi-step run.

## Excluded From Normal Rollout

These are not part of the Chrome extension rollout path:

- Chrome policy CRX force-install experiments
- GitHub ZIP update buttons

They can be used only for internal testing or diagnostics. A release is not ready for other computers if it depends on any of them.

## Release Gate

Before a release is trusted:

1. Syntax checks pass.
2. Manifest permissions are inspected.
3. Feature Health Check passes in the target Chrome profile.
4. Copy Full Diagnostic Report works in the target Chrome profile.
5. Settings Backup/Restore works before update or reinstall testing.
6. EcomSniper automatic-click continuation is tested on at least one signed-in eBay computer, including safe stop/reset.
7. Dashboard sync is tested.
8. Any final marketplace action still stops for operator approval.
9. `dist\GLDN-Ops-webstore-vX.Y.Z.zip` is built and tested in a clean Chrome profile.
