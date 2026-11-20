// New, opt-in integration surface. Legacy scene and scoring stay untouched until tested.
// Compatible with Unity 5.6-era UnityWebRequest / JsonUtility APIs.
using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public class KioskApiClient : MonoBehaviour
{
    [Header("Provision from the protected admin dashboard, NEVER in Git")]
    public string ApiBaseUrl = "http://127.0.0.1:8787";
    [NonSerialized] public string MachineId = "";
    [NonSerialized] public string MachineKeyBase64Url = "";

    [Serializable] private class DeviceConfig { public string api_url; public string machine_id; public string machine_key; }
    private bool configValid;
    private void LoadDeviceConfig()
    {
        string path = Environment.GetEnvironmentVariable("SLOT_KIOSK_CONFIG_PATH");
        if (string.IsNullOrEmpty(path)) path = Path.Combine(Application.persistentDataPath, "kiosk-device.json");
        try
        {
            DeviceConfig config = JsonUtility.FromJson<DeviceConfig>(File.ReadAllText(path));
            Uri endpoint;
            Guid deviceId;
            if (config == null || string.IsNullOrEmpty(config.machine_key) ||
                !Guid.TryParse(config.machine_id, out deviceId) ||
                !Uri.TryCreate(config.api_url, UriKind.Absolute, out endpoint) ||
                !(endpoint.Scheme == "https" || (endpoint.Scheme == "http" && endpoint.Host == "127.0.0.1")) ||
                config.machine_key.Length < 40) throw new Exception("Invalid kiosk device config");
            ApiBaseUrl = config.api_url.TrimEnd('/');
            MachineId = config.machine_id;
            MachineKeyBase64Url = config.machine_key;
            configValid = true;
        }
        catch (Exception ex)
        {
            configValid = false;
            Debug.LogError("Secure kiosk configuration required: " + ex.Message);
        }
    }

    [Header("Optional status labels")]
    public Text StatusText;
    public Text PlayerText;
    public Text CheckinUrlText;

    public bool AcceptNewGames { get; private set; }
    public string ActiveSessionId { get; private set; }
    public string CurrentJoinUrl { get; private set; }
    public int ServerCredits { get; private set; }
    public int PendingScoreCount { get { return pending.items.Count; } }
    public string ActiveEventSlug { get; private set; }

    [Serializable] private class MachineInfo { public bool enabled; public int command_seq; public int ack_seq; }
    [Serializable] private class SessionInfo { public string id; public string display_name; public int credits; public int total_score; }
    [Serializable] private class EventInfo { public string slug; public string name; public string state; }
    [Serializable] private class MachineState { public MachineInfo machine; public SessionInfo session; public EventInfo @event; }
    [Serializable] private class Checkin { public string join_url; public long expires_at; }
    [Serializable] private class SpinRequest { public string session_id; public int cost; }
    [Serializable] private class SpinResult { public string spin_token; public string session_id; public int cost; public long expires_at; }
    [Serializable] private class Ack { public int command_seq; }
    [Serializable] private class ScoreRequest { public string session_id; public string spin_token; public int award; public long played_at; public string client_result_hash; }
    [Serializable] private class EndRequest { public string session_id; }
    [Serializable] private class ScoreQueue { public List<ScoreRequest> items = new List<ScoreRequest>(); }

    private ScoreQueue pending = new ScoreQueue();
    private bool flushing;
    private bool networkBusy;
    private string QueuePath { get { return Path.Combine(Application.persistentDataPath, "slot-scores-queue.json"); } }

    void Start()
    {
        AcceptNewGames = false;
        LoadDeviceConfig();
        LoadPending();
        StartCoroutine(PollLoop());
    }

    private void UpdateStatus(string message)
    {
        if (StatusText != null) StatusText.text = message;
    }

    private static string Hex(byte[] bytes)
    {
        StringBuilder result = new StringBuilder(bytes.Length * 2);
        foreach (byte b in bytes) result.Append(b.ToString("x2"));
        return result.ToString();
    }
    private static string Sha256Hex(string value)
    {
        using (SHA256 sha = SHA256.Create()) return Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(value)));
    }
    private static byte[] DecodeKey(string input)
    {
        string padded = input.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight((padded.Length + 3) / 4 * 4, '=');
        return Convert.FromBase64String(padded);
    }
    private static string Sign(byte[] key, string canonical)
    {
        using (HMACSHA256 hmac = new HMACSHA256(key))
            return Hex(hmac.ComputeHash(Encoding.UTF8.GetBytes(canonical)));
    }
    private static long EpochMillis()
    {
        return (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalMilliseconds;
    }
    private IEnumerator SignedRequest(string method, string path, string body, Action<bool, string> callback)
    {
        if (!configValid || string.IsNullOrEmpty(MachineId) || string.IsNullOrEmpty(MachineKeyBase64Url) ||
            !Uri.IsWellFormedUriString(ApiBaseUrl, UriKind.Absolute))
        {
            callback(false, "Kiosk has not been provisioned");
            yield break;
        }

        string timestamp = EpochMillis().ToString();
        string nonce = Guid.NewGuid().ToString("N");
        byte[] key;
        try { key = DecodeKey(MachineKeyBase64Url); }
        catch { callback(false, "Invalid machine key"); yield break; }

        string canonical = timestamp + "\n" + nonce + "\n" + method + "\n" + path + "\n" + Sha256Hex(body);
        string signature = Sign(key, canonical);
        // Machine API is same-origin, no query parameters or redirects; HTTPS required outside localhost.
        string address = ApiBaseUrl.TrimEnd('/') + path;
        using (UnityWebRequest req = new UnityWebRequest(address, method))
        {
            req.downloadHandler = new DownloadHandlerBuffer();
            if (method != "GET")
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
                req.SetRequestHeader("Content-Type", "application/json");
            }
            req.SetRequestHeader("X-Machine-Id", MachineId);
            req.SetRequestHeader("X-Machine-Timestamp", timestamp);
            req.SetRequestHeader("X-Machine-Nonce", nonce);
            req.SetRequestHeader("X-Machine-Signature", signature);
            yield return req.Send();
            bool ok = !req.isError && req.responseCode >= 200 && req.responseCode < 300;
            callback(ok, req.downloadHandler != null ? req.downloadHandler.text : req.error);
        }
    }

    private IEnumerator PollLoop()
    {
        while (true)
        {
            if (!networkBusy)
            {
                networkBusy = true;
                yield return StartCoroutine(SignedRequest("GET", "/api/machine/state", "", (ok, response) =>
                {
                    if (!ok)
                    {
                        AcceptNewGames = false; // Fail closed on lost control connectivity.
                        UpdateStatus("OFFLINE – new spins blocked");
                        return;
                    }
                    try
                    {
                        MachineState state = JsonUtility.FromJson<MachineState>(response);
                        if (state.machine == null) throw new Exception("Malformed machine state");
                        AcceptNewGames = state.machine.enabled && state.session != null;
                        ActiveSessionId = state.session != null ? state.session.id : null;
                        ServerCredits = state.session != null ? state.session.credits : 0;
                        ActiveEventSlug = state.@event != null ? state.@event.slug : null;
                        if (PlayerText != null) PlayerText.text = state.session == null ? "Scan to join" : state.session.display_name;
                        UpdateStatus(state.machine.enabled ? (state.session == null ? "READY – waiting for player" : "PLAYER READY") : "DISABLED BY OPERATOR");
                        if (state.machine.command_seq > state.machine.ack_seq)
                            StartCoroutine(Acknowledge(state.machine.command_seq));
                    }
                    catch
                    {
                        AcceptNewGames = false;
                        UpdateStatus("INVALID SERVER STATE");
                    }
                }));
                networkBusy = false;
                if (!flushing && pending.items.Count > 0) StartCoroutine(FlushQueue());
            }
            yield return new WaitForSeconds(5.0f);
        }
    }

    private IEnumerator Acknowledge(int commandSeq)
    {
        Ack ack = new Ack(); ack.command_seq = commandSeq;
        yield return StartCoroutine(SignedRequest("POST", "/api/machine/ack", JsonUtility.ToJson(ack), (ok, reply) => { }));
    }

    public void RequestCheckin(Action<bool, string> onReady)
    {
        StartCoroutine(SignedRequest("POST", "/api/machine/checkins", "{}", (ok, response) =>
        {
            if (!ok) { onReady(false, response); return; }
            Checkin data = JsonUtility.FromJson<Checkin>(response);
            CurrentJoinUrl = data.join_url;
            if (CheckinUrlText != null) CheckinUrlText.text = CurrentJoinUrl;
            onReady(true, CurrentJoinUrl);
        }));
    }

    public void ReserveSpin(int cost, Action<bool, string> callback)
    {
        if (!AcceptNewGames || string.IsNullOrEmpty(ActiveSessionId))
        {
            callback(false, "No active online game session");
            return;
        }
        SpinRequest request = new SpinRequest(); request.session_id = ActiveSessionId; request.cost = cost;
        StartCoroutine(SignedRequest("POST", "/api/machine/spins", JsonUtility.ToJson(request), (ok, response) =>
        {
            if (!ok) { callback(false, response); return; }
            SpinResult result = JsonUtility.FromJson<SpinResult>(response);
            callback(true, result.spin_token); // Keep this token until the round result is queued.
        }));
    }

    // Call this exactly once at the end of an existing reel/scoring round.
    // Supply the already issued token; do not calculate extra rewards here.
    public void QueueCompletedScore(string sessionId, string spinToken, int award, string resultHash)
    {
        if (string.IsNullOrEmpty(sessionId) || string.IsNullOrEmpty(spinToken)) return;
        ScoreRequest item = new ScoreRequest();
        item.session_id = sessionId; item.spin_token = spinToken;
        item.award = award; item.played_at = EpochMillis();
        item.client_result_hash = Sha256Hex(spinToken + ":" + sessionId + ":" + award + ":" + item.played_at);
        pending.items.Add(item);
        SavePending();
        if (!flushing) StartCoroutine(FlushQueue());
    }

    private IEnumerator FlushQueue()
    {
        if (flushing) yield break;
        flushing = true;
        while (pending.items.Count > 0)
        {
            ScoreRequest item = pending.items[0];
            bool success = false;
            bool permanentFailure = false;
            yield return StartCoroutine(SignedRequest("POST", "/api/machine/scores", JsonUtility.ToJson(item), (ok, response) =>
            {
                success = ok;
                // Rejected scores need manual attention; retain them rather than silently discard.
                permanentFailure = !ok && response != null && response.Contains("SCORE_REPLAY_MISMATCH");
            }));
            if (!success)
            {
                UpdateStatus(permanentFailure ? "SCORE CONFLICT – CALL OPERATOR" : "OFFLINE – score queued");
                break;
            }
            pending.items.RemoveAt(0);
            SavePending();
        }
        flushing = false;
    }

    public void EndSession(Action<bool, string> onEnd)
    {
        if (string.IsNullOrEmpty(ActiveSessionId)) { onEnd(false, "No active session"); return; }
        EndRequest request = new EndRequest(); request.session_id = ActiveSessionId;
        StartCoroutine(SignedRequest("POST", "/api/machine/end", JsonUtility.ToJson(request), (ok, response) =>
        {
            if (ok) { ActiveSessionId = null; AcceptNewGames = false; }
            onEnd(ok, response);
        }));
    }

    private void LoadPending()
    {
        try
        {
            if (File.Exists(QueuePath))
            {
                ScoreQueue loaded = JsonUtility.FromJson<ScoreQueue>(File.ReadAllText(QueuePath));
                if (loaded != null && loaded.items != null) pending = loaded;
            }
        }
        catch (Exception ex) { UpdateStatus("Queue load error: " + ex.Message); }
    }
    private void SavePending()
    {
        try
        {
            Directory.CreateDirectory(Application.persistentDataPath);
            string staged = QueuePath + ".new";
            File.WriteAllText(staged, JsonUtility.ToJson(pending));
            if (File.Exists(QueuePath)) File.Delete(QueuePath);
            File.Move(staged, QueuePath);
        }
        catch (Exception ex) { UpdateStatus("Queue save error: " + ex.Message); }
    }
}
