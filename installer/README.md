# GLDN Ops Local Installer

Chrome Web Store, Chrome policy, CRX force-install, Git, Node.js, and the retired
Windows click helper are not required.

From the extracted GLDN Ops folder, double-click `Install-GLDN-Ops.cmd`. The
installer validates the exact local extension files and prints the folder to
select in Chrome.

For each intended signed-in Chrome profile:

1. Open `chrome://extensions` in that profile.
2. Turn on Developer mode.
3. Click **Load unpacked**.
4. Select the printed `GLDN-Ops\extension` folder.
5. Open GLDN Ops and select the computer once.

The installer deliberately does not guess a Chrome profile. If a script is
given `-ProfileDirectory "Profile 2"`, it preserves the space and opens that
exact profile. Without that argument it leaves Chrome untouched.

The one-time installer adds a hidden, loopback-only update agent that starts
with Windows. After setup, use **Update & Reload** inside GLDN Ops. It downloads
only the published stable release, verifies its SHA-256 checksum and manifest
version, preserves `extension\config.js` and Chrome storage, creates a rollback
snapshot, replaces the runtime transactionally, and reloads the extension.

Every Chrome profile on the same computer should point to the same stable
`%LOCALAPPDATA%\GLDN Ops\extension` folder. Each profile requires **Load
unpacked** once; later releases do not require another ZIP download or folder
selection.
