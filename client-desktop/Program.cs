namespace ChatDesktop;

using System.Runtime.InteropServices;

static class Program
{
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    private const int SW_RESTORE = 9;

    /// <summary>
    ///  The main entry point for the application.
    /// </summary>
    [STAThread]
    static void Main()
    {
        const string appMutexName = "EasyChat_Softdreams_SingleInstance_Mutex";
        using var mutex = new Mutex(true, appMutexName, out bool isNewInstance);

        if (!isNewInstance)
        {
            // Nếu EasyChat đã đang mở, tự động đưa cửa sổ cũ lên đầu màn hình thay vì báo lỗi
            try
            {
                var currentProcess = System.Diagnostics.Process.GetCurrentProcess();
                var processes = System.Diagnostics.Process.GetProcessesByName(currentProcess.ProcessName);
                foreach (var process in processes)
                {
                    if (process.Id != currentProcess.Id && process.MainWindowHandle != IntPtr.Zero)
                    {
                        ShowWindowAsync(process.MainWindowHandle, SW_RESTORE);
                        SetForegroundWindow(process.MainWindowHandle);
                        break;
                    }
                }
            }
            catch {}
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.Run(new Form1());
    }    
}