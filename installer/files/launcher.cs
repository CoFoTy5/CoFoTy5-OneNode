using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

// CoFoTy5 OneNode launcher
// Runs Start_OneNode.bat (next to this exe), then minimizes the black console window
// once ComfyUI is ready. Closing the window (or the taskbar entry) stops ComfyUI.
// The installer compiles this file on the user's PC (csc.exe from .NET Framework 4).
class Launcher
{
    [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    const int SW_SHOWMINNOACTIVE = 7;

    // ComfyUI address to wait for
    const string URL = "http://127.0.0.1:8188/";

    static IntPtr hwnd;

    static bool IsReady()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(URL);
            req.Timeout = 1500;
            req.Method = "GET";
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
            {
                return true;
            }
        }
        catch { return false; }
    }

    static void WaitAndMinimize()
    {
        // poll up to 10 minutes
        for (int i = 0; i < 600; i++)
        {
            if (IsReady())
            {
                Thread.Sleep(3000); // let the browser open first
                if (hwnd != IntPtr.Zero) ShowWindow(hwnd, SW_SHOWMINNOACTIVE);
                return;
            }
            Thread.Sleep(1000);
        }
    }

    static int Main()
    {
        hwnd = GetConsoleWindow();

        string dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        string bat = Path.Combine(dir, "Start_OneNode.bat");
        if (!File.Exists(bat))
        {
            Console.WriteLine("Start_OneNode.bat not found next to this exe:");
            Console.WriteLine(dir);
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return 1;
        }

        Thread t = new Thread(WaitAndMinimize);
        t.IsBackground = true;
        t.Start();

        ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", "/c \"" + bat + "\"");
        psi.WorkingDirectory = dir;
        psi.UseShellExecute = false;
        Process p = Process.Start(psi);
        p.WaitForExit();
        return p.ExitCode;
    }
}
