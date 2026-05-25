using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace LiveScoreViewer;

public record NoteData(
    int pitch,
    double startTime,
    double duration
);

public record ScoreData(
    List<NoteData> notes,
    int scaleRoot,
    string scaleName,
    double clipStart
);

public partial class MainForm : Form
{
    private const int port_number = 63253;

    private UdpClient udpClient;
    private SplitContainer splitContainer;
    private WebView2 scoreWebView2;
    private TextBox logTextBox;
    private Button clearLogButton;

    public MainForm()
    {
        InitializeComponent();

        splitContainer = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            SplitterDistance = 300
        };

        Controls.Add(splitContainer);

        scoreWebView2 = new WebView2
        {
            Dock = DockStyle.Fill
        };

        splitContainer.Panel1.Controls.Add(scoreWebView2);

        Load += async (_, _) => await InitializeWebView2Async();

        logTextBox = new TextBox
        {
            Multiline = true,
            ScrollBars = ScrollBars.Vertical,
            Dock = DockStyle.Fill,
            Font = new Font("Consolas", 10)
        };

        var contextMenu = new ContextMenuStrip();
        contextMenu.Items.Add("Clear", null, (_, _) => logTextBox.Clear());
        logTextBox.ContextMenuStrip = contextMenu;

        splitContainer.Panel2.Controls.Add(logTextBox);

        udpClient = new UdpClient(port_number);

        Task.Run(ReceiveLoop);
    }

    private async Task ReceiveLoop()
    {
        AppendLog("Application started.");

        while (true)
        {
            UdpReceiveResult result =
                await udpClient.ReceiveAsync();

            string text = Encoding.UTF8.GetString(result.Buffer);
            text = text.TrimEnd(',', '\0', '\r', '\n');

            try
            {
                ScoreData? scoreData =
                    JsonSerializer.Deserialize<ScoreData>(text);

                if (scoreData == null)
                    continue;

                foreach (NoteData note in scoreData.notes)
                {
                    AppendLog(
                        $"pitch = {note.pitch,3}  " +
                        $"start = {$"{note.startTime:0.###}".PadRight(5),8}  " +
                        $"duration = {$"{note.duration:0.###}".PadRight(5),8}"
                    );
                }

                AppendLog($"scaleRoot = {scoreData.scaleRoot}  scaleName = {scoreData.scaleName}");

                string json = JsonSerializer.Serialize(scoreData);
                UpdateScore(json);
            }
            catch (Exception ex)
            {
                AppendLog(ex.Message);
                AppendLog(text);
            }
        }
    }

    private void AppendLog(string text)
    {
        if (InvokeRequired)
        {
            Invoke(() => AppendLog(text));
            return;
        }

        logTextBox.AppendText(
            text + Environment.NewLine
        );
    }

    private async Task InitializeWebView2Async()
    {
        var env = await CoreWebView2Environment.CreateAsync(
            browserExecutableFolder: null,
            userDataFolder: Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "LiveScoreViewer", "WebView2"
            )
        );
        await scoreWebView2.EnsureCoreWebView2Async(env);
        scoreWebView2.CoreWebView2.OpenDevToolsWindow();

        string html = LoadHtml("score.html");
        string osmd = LoadHtml("osmd.js");
        string scoreJs = LoadHtml("score.js");
        html = html.Replace("__OSMD__", osmd);
        html = html.Replace("__SCORE_JS__", scoreJs);
        scoreWebView2.NavigateToString(html);
    }

    private string LoadHtml(string filename)
    {
        var assembly = System.Reflection.Assembly.GetExecutingAssembly();
        string resourceName = $"LiveScoreViewer.Resources.{filename}";
        using var stream = assembly.GetManifestResourceStream(resourceName)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private void UpdateScore(string json)
    {
        if (InvokeRequired)
        {
            Invoke(() => UpdateScore(json));
            return;
        }
        string escaped = json.Replace("\\", "\\\\").Replace("'", "\\'");
        scoreWebView2.ExecuteScriptAsync($"updateScore('{escaped}')");
    }
}
