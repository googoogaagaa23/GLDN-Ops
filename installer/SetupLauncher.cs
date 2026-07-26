using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;

internal static class SetupLauncher
{
    private const int SwShow = 5;

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AllocConsole();

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);

    [STAThread]
    private static int Main()
    {
        EnsureVisibleConsole();
        Console.Title = "GLDN Ops Setup";
        Console.ForegroundColor = ConsoleColor.White;
        Console.WriteLine("GLDN Ops Setup");
        Console.WriteLine("===============");
        Console.WriteLine("This window will stay open and show the final result.");
        Console.WriteLine();

        var runId = Guid.NewGuid().ToString("N");
        var scriptPath = Path.Combine(Path.GetTempPath(), "gldn-install-" + runId + ".ps1");
        var bootstrapPath = Path.Combine(Path.GetTempPath(), "gldn-bootstrap-" + runId + ".ps1");
        var exitCode = 1;

        try
        {
            ExtractResource("InstallLatest.ps1", scriptPath);
            ExtractResource("BootstrapInstall.ps1", bootstrapPath);
            var powerShellPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "WindowsPowerShell",
                "v1.0",
                "powershell.exe");

            var startInfo = new ProcessStartInfo
            {
                FileName = powerShellPath,
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + scriptPath +
                    "\" -BootstrapScriptPath \"" + bootstrapPath + "\"",
                UseShellExecute = false,
                CreateNoWindow = false,
                WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
            };

            using (var process = Process.Start(startInfo))
            {
                if (process == null)
                {
                    throw new InvalidOperationException("Windows could not start PowerShell.");
                }
                process.WaitForExit();
                exitCode = process.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("GLDN Ops setup failed: " + error.Message);
            Console.ResetColor();
            exitCode = 1;
        }
        finally
        {
            try
            {
                if (File.Exists(scriptPath)) File.Delete(scriptPath);
                if (File.Exists(bootstrapPath)) File.Delete(bootstrapPath);
            }
            catch
            {
                // The persistent setup log is more important than temporary-file cleanup.
            }
        }

        Console.WriteLine();
        if (exitCode == 0)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("GLDN Ops setup completed successfully.");
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("GLDN Ops setup failed.");
        }
        Console.ResetColor();
        Console.WriteLine("Setup log: " + Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "GLDN Ops Installer",
            "latest.log"));
        Console.WriteLine();
        Console.WriteLine("Press any key to close this window.");

        if (!Console.IsInputRedirected)
        {
            try { Console.ReadKey(true); } catch { }
        }
        return exitCode;
    }

    private static void EnsureVisibleConsole()
    {
        if (GetConsoleWindow() == IntPtr.Zero)
        {
            AllocConsole();
        }

        var utf8 = new UTF8Encoding(false);
        var output = new StreamWriter(Console.OpenStandardOutput(), utf8) { AutoFlush = true };
        var error = new StreamWriter(Console.OpenStandardError(), utf8) { AutoFlush = true };
        Console.SetOut(output);
        Console.SetError(error);
        ShowWindow(GetConsoleWindow(), SwShow);
    }

    private static void ExtractResource(string resourceName, string destination)
    {
        using (var input = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName))
        {
            if (input == null)
            {
                throw new InvalidOperationException("The embedded setup resource is missing: " + resourceName);
            }
            using (var output = File.Create(destination))
            {
                input.CopyTo(output);
            }
        }
    }
}
