using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ChatDesktop;

public class AppConfig
{
    public string ServerUrl { get; set; } = "https://prompt-your-industry-exercises.trycloudflare.com";
    public bool EnableNotification { get; set; } = true;
    public bool ShowMessagePreview { get; set; } = true;
    public bool EnableTaskbarFlash { get; set; } = true;
    public bool EnableTaskbarBadge { get; set; } = true;
}

public partial class Form1 : Form
{
    private WebView2 webView = null!;
    private readonly string appDataConfigFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), 
        "EasyChat", 
        "config.json"
    );
    private readonly string localConfigFile = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "config.json");
    private string currentServerUrl = "https://prompt-your-industry-exercises.trycloudflare.com";
    private bool isFullscreen = false;
    private FormWindowState prevWindowState = FormWindowState.Normal;

    // Cài đặt thông báo & Riêng tư (Hình 1 & Hình 2)
    private bool enableNotification = true;
    private bool showMessagePreview = true;
    private bool enableTaskbarFlash = true;
    private bool enableTaskbarBadge = true;

    private Icon? baseAppIcon = null;
    private Icon? currentBadgedIcon = null;
    private IntPtr currentOverlayIconHandle = IntPtr.Zero;
    private ITaskbarList3? taskbarList = null;

    public Form1()
    {
        InitializeComponent();
        SetupWindow();
        InitTaskbar();
        LoadConfig();
        InitWebViewAsync();
    }

    private void SetupWindow()
    {
        this.Text = "EasyChat";
        this.StartPosition = FormStartPosition.CenterScreen;
        this.Size = new Size(1200, 780);
        this.MinimumSize = new Size(820, 560);
        this.KeyPreview = true;
        this.KeyDown += Form1_KeyDown;

        // Cài đặt icon cam "Easy" phong cách Zalo cho cửa sổ và thanh Taskbar
        try
        {
            var stream = typeof(Form1).Assembly.GetManifestResourceStream("ChatDesktop.app.ico");
            if (stream != null)
            {
                this.Icon = new Icon(stream);
            }
            else
            {
                var exePath = Environment.ProcessPath ?? Application.ExecutablePath;
                if (!string.IsNullOrEmpty(exePath))
                {
                    var icon = Icon.ExtractAssociatedIcon(exePath);
                    if (icon != null) this.Icon = icon;
                }
            }
            if (this.Icon != null)
            {
                baseAppIcon = (Icon)this.Icon.Clone();
            }
        }
        catch {}

        // Dừng nhấp nháy taskbar khi người dùng chuyển vào cửa sổ EasyChat
        this.Activated += (s, e) =>
        {
            StopFlashTaskbar();
            try
            {
                webView?.CoreWebView2?.PostWebMessageAsString("WINDOW_ACTIVATED");
            }
            catch {}
        };
        SetupNotifyIcon();
        this.FormClosing += (s, e) =>
        {
            if (notifyIcon != null)
            {
                notifyIcon.Visible = false;
                notifyIcon.Dispose();
            }
        };

        // Thanh menu tiện ích phía trên (rất gọn gàng)
        var menuStrip = new MenuStrip();
        var menuHeThong = new ToolStripMenuItem("Hệ thống");
        
        var itemDoiIp = new ToolStripMenuItem("Cài đặt địa chỉ Máy chủ LAN (F2)...", null, (s, e) => ShowChangeServerDialog());
        var itemNotif = new ToolStripMenuItem("Cài đặt Thông báo & Riêng tư (F3)...", null, (s, e) => {
            webView?.CoreWebView2?.ExecuteScriptAsync("document.getElementById('settingsBtn')?.click();");
        });
        var itemTaiLai = new ToolStripMenuItem("Tải lại giao diện mới nhất (F5)", null, (s, e) => webView?.Reload());
        var itemDevTools = new ToolStripMenuItem("Công cụ gỡ lỗi (F12)", null, (s, e) => webView?.CoreWebView2?.OpenDevToolsWindow());
        var itemThoat = new ToolStripMenuItem("Thoát", null, (s, e) => Application.Exit());

        menuHeThong.DropDownItems.Add(itemDoiIp);
        menuHeThong.DropDownItems.Add(itemNotif);
        menuHeThong.DropDownItems.Add(itemTaiLai);
        menuHeThong.DropDownItems.Add(new ToolStripSeparator());
        menuHeThong.DropDownItems.Add(itemDevTools);
        menuHeThong.DropDownItems.Add(new ToolStripSeparator());
        menuHeThong.DropDownItems.Add(itemThoat);

        var menuTroGiup = new ToolStripMenuItem("Trợ giúp");
        var itemAbout = new ToolStripMenuItem("Thông tin phần mềm...", null, (s, e) => {
            MessageBox.Show(
                $"Phần mềm EasyChat (Desktop Edition)\n" +
                $"Địa chỉ máy chủ hiện tại: {currentServerUrl}\n\n" +
                $"• F5: Tải lại giao diện cập nhật mới nhất từ máy chủ\n" +
                $"• F2: Đổi địa chỉ IP máy chủ\n" +
                $"• F11: Bật / Tắt toàn màn hình",
                "Thông tin phần mềm", MessageBoxButtons.OK, MessageBoxIcon.Information);
        });
        menuTroGiup.DropDownItems.Add(itemAbout);

        menuStrip.Items.Add(menuHeThong);
        menuStrip.Items.Add(menuTroGiup);
        this.MainMenuStrip = menuStrip;
        this.Controls.Add(menuStrip);

        // Khung WebView2 chiếm toàn bộ diện tích
        webView = new WebView2
        {
            Dock = DockStyle.Fill
        };
        this.Controls.Add(webView);
        webView.BringToFront();
    }

    private void LoadConfig()
    {
        try
        {
            // 1. Nếu có file config.json đặt cạnh file .exe thì ưu tiên đọc
            if (File.Exists(localConfigFile))
            {
                string json = File.ReadAllText(localConfigFile);
                var cfg = JsonSerializer.Deserialize<AppConfig>(json);
                if (cfg != null)
                {
                    ApplyConfig(cfg);
                    return;
                }
            }

            // 2. Nếu người dùng từng bấm F2 đổi IP thì đọc từ AppData
            if (File.Exists(appDataConfigFile))
            {
                string json = File.ReadAllText(appDataConfigFile);
                var cfg = JsonSerializer.Deserialize<AppConfig>(json);
                if (cfg != null)
                {
                    ApplyConfig(cfg);
                    return;
                }
            }

            // 3. Mặc định dùng thẳng địa chỉ Cloudflare HTTPS an toàn kết nối toàn cầu:
            currentServerUrl = "https://prompt-your-industry-exercises.trycloudflare.com";
        }
        catch
        {
            currentServerUrl = "https://prompt-your-industry-exercises.trycloudflare.com";
        }
    }

    private void ApplyConfig(AppConfig cfg)
    {
        if (!string.IsNullOrWhiteSpace(cfg.ServerUrl))
        {
            string saved = cfg.ServerUrl.Trim();
            if (!saved.Contains("10.10.0.225"))
            {
                currentServerUrl = saved;
            }
        }
        enableNotification = cfg.EnableNotification;
        showMessagePreview = cfg.ShowMessagePreview;
        enableTaskbarFlash = cfg.EnableTaskbarFlash;
        enableTaskbarBadge = cfg.EnableTaskbarBadge;
    }

    private void SaveConfig(string url)
    {
        try
        {
            currentServerUrl = url.Trim();
            var cfg = new AppConfig
            {
                ServerUrl = currentServerUrl,
                EnableNotification = enableNotification,
                ShowMessagePreview = showMessagePreview,
                EnableTaskbarFlash = enableTaskbarFlash,
                EnableTaskbarBadge = enableTaskbarBadge
            };
            string json = JsonSerializer.Serialize(cfg, new JsonSerializerOptions { WriteIndented = true });

            // Lưu vào AppData để giữ thư mục file .exe luôn sạch đẹp chỉ duy nhất 1 file
            string? dir = Path.GetDirectoryName(appDataConfigFile);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
            File.WriteAllText(appDataConfigFile, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine("Lỗi lưu config: " + ex.Message);
        }
    }

    private async void InitWebViewAsync()
    {
        try
        {
            // Trích xuất các origin cần coi là an toàn (để bật Micro, Camera, WebRTC và SpeechRecognition trên HTTP)
            var secureOrigins = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "http://10.10.0.225:3888",
                "http://localhost:3888",
                "http://127.0.0.1:3888",
                "http://10.10.0.225:3000",
                "http://localhost:3000",
                "http://127.0.0.1:3000"
            };

            if (!string.IsNullOrWhiteSpace(currentServerUrl))
            {
                string cleanUrl = currentServerUrl.TrimEnd('/');
                if (!cleanUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                    !cleanUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                {
                    cleanUrl = "http://" + cleanUrl;
                }
                secureOrigins.Add(cleanUrl);
            }

            string originsArg = string.Join(",", secureOrigins);

            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments = 
                    $"--unsafely-treat-insecure-origin-as-secure={originsArg} " +
                    "--enable-features=WebSpeechAPI " +
                    "--use-fake-ui-for-media-stream " +
                    "--allow-running-insecure-content " +
                    "--autoplay-policy=no-user-gesture-required"
            };

            // Dùng thư mục profile riêng biệt trong AppData để tránh cache quyền từ chối cũ
            string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "EasyChat", "WebView2Profile");
            CoreWebView2Environment? env = null;

            try
            {
                env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
            }
            catch (Exception ex) when (ex.HResult == unchecked((int)0x800700AA) || ex.Message.Contains("0x800700AA") || ex.Message.Contains("resource is in use"))
            {
                // Nếu thư mục chính đang bị khoá bởi tiến trình khác, tự động dùng thư mục phụ để luôn luôn khởi động thành công
                string altDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "EasyChat", $"WebView2Profile_{Environment.ProcessId}");
                env = await CoreWebView2Environment.CreateAsync(null, altDataFolder, options);
            }

            await webView.EnsureCoreWebView2Async(env);

            // Cấu hình các thiết lập của WebView2
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView.CoreWebView2.Settings.IsBuiltInErrorPageEnabled = true;

            // Tự động cấp toàn bộ quyền truy cập Micro, Camera, Thông báo mà không cần hỏi người dùng
            webView.CoreWebView2.PermissionRequested += (s, e) =>
            {
                e.State = CoreWebView2PermissionState.Allow;
                e.Handled = true;
            };

            // Tiêu đề cửa sổ tự động đồng bộ theo trang web
            webView.CoreWebView2.DocumentTitleChanged += (s, e) =>
            {
                if (!string.IsNullOrWhiteSpace(webView.CoreWebView2.DocumentTitle))
                {
                    this.Text = webView.CoreWebView2.DocumentTitle;
                }
                else
                {
                    this.Text = "EasyChat";
                }
            };

            // Mở link ngoài bằng trình duyệt mặc định nếu cần
            webView.CoreWebView2.NewWindowRequested += (s, e) =>
            {
                e.Handled = true;
                if (!string.IsNullOrEmpty(e.Uri))
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = e.Uri,
                        UseShellExecute = true
                    });
                }
            };

            // Xử lý khi mất kết nối hoặc không tới được máy chủ (do khác mạng LAN / ngoài văn phòng)
            webView.CoreWebView2.NavigationCompleted += (s, e) =>
            {
                if (!e.IsSuccess && e.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                {
                    string errorHtml = $@"
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset='utf-8'>
                        <title>Không thể kết nối máy chủ</title>
                        <style>
                            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; text-align: center; }}
                            .card {{ background: #1e293b; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 520px; border: 1px solid #334155; }}
                            .icon {{ font-size: 48px; margin-bottom: 12px; }}
                            h2 {{ color: #f87171; margin-top: 0; font-size: 22px; }}
                            p {{ color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 14px 0; }}
                            .url-badge {{ background: #0f172a; padding: 8px 14px; border-radius: 8px; font-family: monospace; color: #38bdf8; font-size: 13px; word-break: break-all; display: inline-block; border: 1px solid #334155; }}
                            .reasons {{ text-align: left; background: #0f172a; padding: 14px 18px; border-radius: 8px; margin: 16px 0; font-size: 13px; color: #cbd5e1; border-left: 3px solid #f59e0b; }}
                            .btn {{ display: inline-block; padding: 10px 20px; margin: 8px 6px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }}
                            .btn-primary {{ background: #2563eb; color: #fff; }}
                            .btn-secondary {{ background: #334155; color: #f8fafc; }}
                            .btn:hover {{ opacity: 0.9; }}
                        </style>
                    </head>
                    <body>
                        <div class='card'>
                            <div class='icon'>📡</div>
                            <h2>Không thể kết nối tới Máy chủ</h2>
                            <p>Ứng dụng không thể kết nối tới địa chỉ:</p>
                            <div class='url-badge'>{currentServerUrl}</div>
                            <div class='reasons'>
                                <strong>⚠️ Nguyên nhân chính:</strong><br>
                                1. Bạn đang ở <strong>văn phòng khác</strong> hoặc <strong>mạng Wi-Fi khác</strong> ngoài mạng LAN văn phòng chính (IP 10.10.x.x chỉ dùng nội bộ).<br>
                                2. Máy tính chạy máy chủ chưa khởi động hoặc bị chặn tường lửa (Firewall).
                            </div>
                            <div>
                                <button class='btn btn-primary' onclick='window.chrome.webview.postMessage(""CHANGE_SERVER"")'>⚙️ Đổi địa chỉ máy chủ (F2)</button>
                                <button class='btn btn-secondary' onclick='location.reload()'>🔄 Thử lại (F5)</button>
                            </div>
                        </div>
                    </body>
                    </html>";
                    webView.CoreWebView2.NavigateToString(errorHtml);
                }
            };

            // Lắng nghe sự kiện từ giao diện Web
            webView.CoreWebView2.WebMessageReceived += (s, e) =>
            {
                try
                {
                    string rawMessage = e.TryGetWebMessageAsString();
                    string jsonMessage = "";
                    try { jsonMessage = e.WebMessageAsJson; } catch {}

                    if (rawMessage == "TRIGGER_VOICE_TYPING" || jsonMessage.Contains("TRIGGER_VOICE_TYPING"))
                    {
                        TriggerVoiceTyping();
                    }
                    else if (rawMessage == "CHANGE_SERVER" || jsonMessage.Contains("CHANGE_SERVER"))
                    {
                        this.BeginInvoke(() => ShowChangeServerDialog());
                    }
                    else if (jsonMessage.Contains("NEW_MESSAGE_NOTIFICATION") || (rawMessage != null && rawMessage.Contains("NEW_MESSAGE_NOTIFICATION")))
                    {
                        try
                        {
                            string parseTarget = (!string.IsNullOrEmpty(rawMessage) && rawMessage.StartsWith("{")) ? rawMessage : jsonMessage;
                            using var doc = JsonDocument.Parse(parseTarget);
                            var root = doc.RootElement;
                            string sender = root.TryGetProperty("sender", out var sProp) ? (sProp.GetString() ?? "Đồng nghiệp") : "Đồng nghiệp";
                            string text = root.TryGetProperty("text", out var tProp) ? (tProp.GetString() ?? "") : "";
                            ShowDesktopNotification(sender, text);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Lỗi parse notification: " + ex.Message);
                        }
                    }
                    else if (jsonMessage.Contains("UPDATE_UNREAD_COUNT") || (rawMessage != null && rawMessage.Contains("UPDATE_UNREAD_COUNT")))
                    {
                        try
                        {
                            string parseTarget = (!string.IsNullOrEmpty(rawMessage) && rawMessage.StartsWith("{")) ? rawMessage : jsonMessage;
                            using var doc = JsonDocument.Parse(parseTarget);
                            var root = doc.RootElement;
                            int count = root.TryGetProperty("count", out var cProp) ? cProp.GetInt32() : 0;
                            UpdateTaskbarBadge(count);
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Lỗi UPDATE_UNREAD_COUNT: " + ex.Message);
                        }
                    }
                    else if (jsonMessage.Contains("SYNC_NOTIFICATION_SETTINGS") || (rawMessage != null && rawMessage.Contains("SYNC_NOTIFICATION_SETTINGS")))
                    {
                        try
                        {
                            string parseTarget = (!string.IsNullOrEmpty(rawMessage) && rawMessage.StartsWith("{")) ? rawMessage : jsonMessage;
                            using var doc = JsonDocument.Parse(parseTarget);
                            var root = doc.RootElement;
                            if (root.TryGetProperty("settings", out var sProp))
                            {
                                if (sProp.TryGetProperty("enabled", out var eProp)) enableNotification = eProp.GetBoolean();
                                if (sProp.TryGetProperty("preview", out var pProp)) showMessagePreview = pProp.GetBoolean();
                                if (sProp.TryGetProperty("taskbar", out var tProp)) enableTaskbarBadge = tProp.GetBoolean();
                                if (sProp.TryGetProperty("flashTaskbar", out var fProp)) enableTaskbarFlash = fProp.GetBoolean();
                                SaveConfig(currentServerUrl);
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine("Lỗi SYNC_NOTIFICATION_SETTINGS: " + ex.Message);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Lỗi WebMessage: " + ex.Message);
                }
            };

            // Điều hướng tới máy chủ
            NavigateToServer();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Không thể khởi động trình duyệt WebView2: {ex.Message}\n" +
                $"Vui lòng kiểm tra máy tính đã có Microsoft Edge WebView2 Runtime.",
                "Lỗi khởi động", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void NavigateToServer()
    {
        if (webView != null && webView.CoreWebView2 != null)
        {
            string url = currentServerUrl;
            if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
                !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                url = "http://" + url;
            }
            webView.CoreWebView2.Navigate(url);
        }
    }

    private void Form1_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F5)
        {
            webView?.Reload();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.F2)
        {
            ShowChangeServerDialog();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.F3)
        {
            webView?.CoreWebView2?.ExecuteScriptAsync("document.getElementById('settingsBtn')?.click();");
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.F11)
        {
            ToggleFullscreen();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.F12)
        {
            webView?.CoreWebView2?.OpenDevToolsWindow();
            e.Handled = true;
        }
    }

    private void ToggleFullscreen()
    {
        if (!isFullscreen)
        {
            prevWindowState = this.WindowState;
            this.FormBorderStyle = FormBorderStyle.None;
            this.WindowState = FormWindowState.Maximized;
            isFullscreen = true;
        }
        else
        {
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.WindowState = prevWindowState;
            isFullscreen = false;
        }
    }

    private void ShowChangeServerDialog()
    {
        using var prompt = new Form
        {
            Width = 460,
            Height = 220,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            Text = "Cài đặt địa chỉ Máy chủ LAN",
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false
        };

        var textLabel = new Label
        {
            Left = 20,
            Top = 20,
            Width = 400,
            Text = "Nhập địa chỉ máy chủ Chat nội bộ:\n(Ví dụ: https://xxxx.trycloudflare.com hoặc http://localhost:3888)"
        };

        var textBox = new TextBox
        {
            Left = 20,
            Top = 70,
            Width = 400,
            Text = currentServerUrl
        };

        var confirmation = new Button
        {
            Text = "Lưu & Kết nối",
            Left = 200,
            Width = 110,
            Top = 115,
            DialogResult = DialogResult.OK
        };

        var cancel = new Button
        {
            Text = "Hủy bỏ",
            Left = 320,
            Width = 100,
            Top = 115,
            DialogResult = DialogResult.Cancel
        };

        confirmation.Click += (sender, e) => { prompt.Close(); };
        cancel.Click += (sender, e) => { prompt.Close(); };

        prompt.Controls.Add(textLabel);
        prompt.Controls.Add(textBox);
        prompt.Controls.Add(confirmation);
        prompt.Controls.Add(cancel);
        prompt.AcceptButton = confirmation;
        prompt.CancelButton = cancel;

        if (prompt.ShowDialog() == DialogResult.OK)
        {
            string newUrl = textBox.Text.Trim();
            if (!string.IsNullOrWhiteSpace(newUrl))
            {
                SaveConfig(newUrl);
                NavigateToServer();
            }
        }
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    private const byte VK_LWIN = 0x5B;
    private const byte VK_H = 0x48;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    public void TriggerVoiceTyping()
    {
        this.BeginInvoke(() =>
        {
            Task.Delay(120).ContinueWith(_ =>
            {
                keybd_event(VK_LWIN, 0, 0, 0);
                keybd_event(VK_H, 0, 0, 0);
                keybd_event(VK_H, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, 0);
            });
        });
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool DestroyIcon(IntPtr handle);

    [ComImport]
    [Guid("ea1afb91-9e28-4b86-90e9-9e9f8a5eefaf")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ITaskbarList3
    {
        [PreserveSig] void HrInit();
        [PreserveSig] void AddTab(IntPtr hwnd);
        [PreserveSig] void DeleteTab(IntPtr hwnd);
        [PreserveSig] void ActivateTab(IntPtr hwnd);
        [PreserveSig] void SetActiveAlt(IntPtr hwnd);
        [PreserveSig] void MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fFullscreen);
        [PreserveSig] void SetProgressValue(IntPtr hwnd, ulong ullCompleted, ulong ullTotal);
        [PreserveSig] void SetProgressState(IntPtr hwnd, int tbpFlags);
        [PreserveSig] void RegisterTab(IntPtr hwnd, IntPtr hwndTab);
        [PreserveSig] void UnregisterTab(IntPtr hwndTab);
        [PreserveSig] void SetTabOrder(IntPtr hwnd, IntPtr hwndInsertBefore);
        [PreserveSig] void SetTabActive(IntPtr hwnd, IntPtr hwndTab, uint dwReserved);
        [PreserveSig] void ThumbBarAddButtons(IntPtr hwnd, uint cButtons, IntPtr pButtons);
        [PreserveSig] void ThumbBarUpdateButtons(IntPtr hwnd, uint cButtons, IntPtr pButtons);
        [PreserveSig] void ThumbBarSetImageList(IntPtr hwnd, IntPtr himl);
        [PreserveSig] void SetOverlayIcon(IntPtr hwnd, IntPtr hIcon, [MarshalAs(UnmanagedType.LPWStr)] string? pszDescription);
        [PreserveSig] void SetThumbnailTooltip(IntPtr hwnd, [MarshalAs(UnmanagedType.LPWStr)] string? pszTip);
        [PreserveSig] void SetThumbnailClip(IntPtr hwnd, IntPtr prcClip);
    }

    [ComImport]
    [Guid("56fdf344-fd6d-11d0-958a-006097c9a090")]
    [ClassInterface(ClassInterfaceType.None)]
    private class TaskbarInstance
    {
    }

    private void InitTaskbar()
    {
        try
        {
            taskbarList = (ITaskbarList3)new TaskbarInstance();
            taskbarList.HrInit();
        }
        catch (Exception ex)
        {
            Console.WriteLine("InitTaskbar: " + ex.Message);
            taskbarList = null;
        }
    }

    private Icon CreateBadgedAppIcon(int count)
    {
        int size = 48;
        var bmp = new Bitmap(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.Clear(Color.Transparent);

            // 1. Vẽ icon gốc EasyChat
            if (baseAppIcon != null)
            {
                using var baseBmp = baseAppIcon.ToBitmap();
                g.DrawImage(baseBmp, 0, 0, size, size);
            }

            // 2. Vẽ huy hiệu tròn đỏ ở góc trên bên phải (Top-Right như Zalo trong ảnh của bạn)
            int badgeSize = 22;
            int badgeX = size - badgeSize;
            int badgeY = 0;
            var badgeRect = new Rectangle(badgeX, badgeY, badgeSize, badgeSize);

            using var redBrush = new SolidBrush(Color.FromArgb(235, 30, 30));
            using var whitePen = new Pen(Color.White, 2f);
            g.FillEllipse(redBrush, badgeRect);
            g.DrawEllipse(whitePen, badgeRect);

            // 3. Vẽ số lượng
            string text = count > 99 ? "99+" : count.ToString();
            float fontSize = text.Length > 2 ? 6.5f : (text.Length > 1 ? 8f : 9.5f);
            using var font = new Font("Segoe UI", fontSize, FontStyle.Bold);
            using var textBrush = new SolidBrush(Color.White);
            using var sf = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center
            };
            g.DrawString(text, font, textBrush, new RectangleF(badgeX, badgeY, badgeSize, badgeSize), sf);
        }

        IntPtr hIcon = bmp.GetHicon();
        return Icon.FromHandle(hIcon);
    }

    private Icon CreateOverlayIcon(int count)
    {
        int size = 24;
        var bmp = new Bitmap(size, size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
            g.Clear(Color.Transparent);

            var rect = new Rectangle(1, 1, size - 2, size - 2);
            using var redBrush = new SolidBrush(Color.FromArgb(235, 30, 30));
            using var whitePen = new Pen(Color.White, 2f);
            g.FillEllipse(redBrush, rect);
            g.DrawEllipse(whitePen, rect);

            string text = count > 99 ? "99+" : count.ToString();
            float fontSize = text.Length > 2 ? 7f : (text.Length > 1 ? 8.5f : 10f);
            using var font = new Font("Segoe UI", fontSize, FontStyle.Bold);
            using var textBrush = new SolidBrush(Color.White);
            using var sf = new StringFormat
            {
                Alignment = StringAlignment.Center,
                LineAlignment = StringAlignment.Center
            };
            g.DrawString(text, font, textBrush, new RectangleF(0, 0, size, size), sf);
        }

        IntPtr hIcon = bmp.GetHicon();
        return Icon.FromHandle(hIcon);
    }

    public void UpdateTaskbarBadge(int count)
    {
        this.BeginInvoke(() =>
        {
            try
            {
                if (!enableTaskbarBadge || count <= 0)
                {
                    if (taskbarList != null)
                    {
                        try { taskbarList.SetOverlayIcon(this.Handle, IntPtr.Zero, null); } catch {}
                    }
                    if (baseAppIcon != null)
                    {
                        this.Icon = baseAppIcon;
                    }
                    if (currentOverlayIconHandle != IntPtr.Zero)
                    {
                        DestroyIcon(currentOverlayIconHandle);
                        currentOverlayIconHandle = IntPtr.Zero;
                    }
                    if (currentBadgedIcon != null)
                    {
                        try { DestroyIcon(currentBadgedIcon.Handle); currentBadgedIcon.Dispose(); } catch {}
                        currentBadgedIcon = null;
                    }
                    return;
                }

                // 1. Cập nhật icon cửa sổ có huy hiệu đỏ góc trên bên phải (như Zalo)
                var newBadged = CreateBadgedAppIcon(count);
                this.Icon = newBadged;
                if (currentBadgedIcon != null)
                {
                    try { DestroyIcon(currentBadgedIcon.Handle); currentBadgedIcon.Dispose(); } catch {}
                }
                currentBadgedIcon = newBadged;

                // 2. Đồng thời áp dụng Windows native Taskbar overlay badge
                if (taskbarList != null)
                {
                    if (currentOverlayIconHandle != IntPtr.Zero)
                    {
                        DestroyIcon(currentOverlayIconHandle);
                        currentOverlayIconHandle = IntPtr.Zero;
                    }
                    var overlayIcon = CreateOverlayIcon(count);
                    currentOverlayIconHandle = overlayIcon.Handle;
                    try
                    {
                        taskbarList.SetOverlayIcon(this.Handle, currentOverlayIconHandle, $"{count} tin nhắn chưa đọc");
                    }
                    catch {}
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("UpdateTaskbarBadge error: " + ex.Message);
            }
        });
    }

    [DllImport("user32.dll")]
    private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    [StructLayout(LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }

    private const uint FLASHW_STOP = 0;
    private const uint FLASHW_TRAY = 2;
    private const uint FLASHW_TIMERNOFG = 12; // Nhấp nháy liên tục cho đến khi người dùng chuyển vào cửa sổ

    public void FlashTaskbar()
    {
        try
        {
            if (Form.ActiveForm == this) return; // Đang ở trong app thì không cần nhấp nháy

            FLASHWINFO fInfo = new FLASHWINFO();
            fInfo.cbSize = Convert.ToUInt32(Marshal.SizeOf(fInfo));
            fInfo.hwnd = this.Handle;
            fInfo.dwFlags = FLASHW_TRAY | FLASHW_TIMERNOFG;
            fInfo.uCount = uint.MaxValue;
            fInfo.dwTimeout = 0;
            FlashWindowEx(ref fInfo);
        }
        catch {}
    }

    public void StopFlashTaskbar()
    {
        try
        {
            FLASHWINFO fInfo = new FLASHWINFO();
            fInfo.cbSize = Convert.ToUInt32(Marshal.SizeOf(fInfo));
            fInfo.hwnd = this.Handle;
            fInfo.dwFlags = FLASHW_STOP;
            fInfo.uCount = 0;
            fInfo.dwTimeout = 0;
            FlashWindowEx(ref fInfo);
        }
        catch {}
    }

    private NotifyIcon? notifyIcon;

    private void SetupNotifyIcon()
    {
        try
        {
            notifyIcon = new NotifyIcon
            {
                Icon = this.Icon,
                Text = "EasyChat - Softdreams",
                Visible = true
            };

            notifyIcon.BalloonTipClicked += (s, e) =>
            {
                this.BeginInvoke(() =>
                {
                    if (this.WindowState == FormWindowState.Minimized)
                    {
                        this.WindowState = FormWindowState.Normal;
                    }
                    this.Show();
                    this.Activate();
                    this.BringToFront();
                });
            };

            notifyIcon.DoubleClick += (s, e) =>
            {
                this.BeginInvoke(() =>
                {
                    if (this.WindowState == FormWindowState.Minimized)
                    {
                        this.WindowState = FormWindowState.Normal;
                    }
                    this.Show();
                    this.Activate();
                    this.BringToFront();
                });
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine("Lỗi SetupNotifyIcon: " + ex.Message);
        }
    }

    public void ShowDesktopNotification(string senderName, string messageText)
    {
        this.BeginInvoke(() =>
        {
            try
            {
                // 1. Nhấp nháy icon thanh Taskbar như Zalo (nếu được bật)
                if (enableTaskbarFlash)
                {
                    FlashTaskbar();
                }

                // 2. Hiện popup thông báo ở góc dưới bên phải màn hình (nếu được bật)
                if (notifyIcon != null && enableNotification)
                {
                    string title = $"EasyChat • {senderName}";
                    string snippet = showMessagePreview 
                        ? (string.IsNullOrWhiteSpace(messageText) ? "Đã gửi cho bạn một tin nhắn mới" : messageText)
                        : "Bạn có một tin nhắn mới";
                    if (snippet.Length > 120) snippet = snippet.Substring(0, 117) + "...";
                    notifyIcon.ShowBalloonTip(4000, title, snippet, ToolTipIcon.Info);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Lỗi ShowDesktopNotification: " + ex.Message);
            }
        });
    }
}
