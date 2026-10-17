using System;
using System.Drawing;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace ChatDesktop;

public class AppConfig
{
    public string ServerUrl { get; set; } = "http://10.10.0.225:3000";
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
    private string currentServerUrl = "http://10.10.0.225:3000";
    private bool isFullscreen = false;
    private FormWindowState prevWindowState = FormWindowState.Normal;

    public Form1()
    {
        InitializeComponent();
        SetupWindow();
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

        // Thanh menu tiện ích phía trên (rất gọn gàng)
        var menuStrip = new MenuStrip();
        var menuHeThong = new ToolStripMenuItem("Hệ thống");
        
        var itemDoiIp = new ToolStripMenuItem("Cài đặt địa chỉ Máy chủ LAN (F2)...", null, (s, e) => ShowChangeServerDialog());
        var itemTaiLai = new ToolStripMenuItem("Tải lại giao diện mới nhất (F5)", null, (s, e) => webView?.Reload());
        var itemDevTools = new ToolStripMenuItem("Công cụ gỡ lỗi (F12)", null, (s, e) => webView?.CoreWebView2?.OpenDevToolsWindow());
        var itemThoat = new ToolStripMenuItem("Thoát", null, (s, e) => Application.Exit());

        menuHeThong.DropDownItems.Add(itemDoiIp);
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
                if (cfg != null && !string.IsNullOrWhiteSpace(cfg.ServerUrl))
                {
                    currentServerUrl = cfg.ServerUrl.Trim();
                    return;
                }
            }

            // 2. Nếu người dùng từng bấm F2 đổi IP thì đọc từ AppData
            if (File.Exists(appDataConfigFile))
            {
                string json = File.ReadAllText(appDataConfigFile);
                var cfg = JsonSerializer.Deserialize<AppConfig>(json);
                if (cfg != null && !string.IsNullOrWhiteSpace(cfg.ServerUrl))
                {
                    currentServerUrl = cfg.ServerUrl.Trim();
                    return;
                }
            }

            // 3. Mặc định dùng thẳng địa chỉ máy chủ đã nhúng sẵn trong code:
            // "http://10.10.0.225:3000" mà không cần bất kỳ file phụ nào!
            currentServerUrl = "http://10.10.0.225:3000";
        }
        catch
        {
            currentServerUrl = "http://10.10.0.225:3000";
        }
    }

    private void SaveConfig(string url)
    {
        try
        {
            currentServerUrl = url.Trim();
            var cfg = new AppConfig { ServerUrl = currentServerUrl };
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

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
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

            // Lắng nghe sự kiện từ giao diện Web (ví dụ: kích hoạt bộ gõ giọng nói Windows)
            webView.CoreWebView2.WebMessageReceived += (s, e) =>
            {
                try
                {
                    string message = e.TryGetWebMessageAsString();
                    if (message == "TRIGGER_VOICE_TYPING")
                    {
                        TriggerVoiceTyping();
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
            Text = "Nhập địa chỉ IP hoặc tên miền của máy chủ Chat nội bộ:\n(Ví dụ: http://10.10.0.225:3000 hoặc http://localhost:3000)"
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
}
