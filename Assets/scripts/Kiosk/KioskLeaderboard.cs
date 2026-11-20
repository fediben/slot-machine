// Public idle leaderboard. Last successful ranking remains visible while offline.
using System;
using System.IO;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public class KioskLeaderboard : MonoBehaviour
{
    public KioskApiClient api;
    public Text board;
    public float refreshSeconds = 15;
    [Serializable] private class Row { public string name; public int points; public int plays; }
    [Serializable] private class Result { public Row[] leaderboard; public bool provisional; }

    IEnumerator Start()
    {
        string cache = Path.Combine(Application.persistentDataPath, "leaderboard-cache.json");
        if (board != null && File.Exists(cache))
        {
            try { Render(JsonUtility.FromJson<Result>(File.ReadAllText(cache))); }
            catch { board.text = "Leaderboard currently unavailable"; }
        }
        while (true)
        {
            if (api != null && board != null && !string.IsNullOrEmpty(api.ActiveEventSlug))
            {
                string url = api.ApiBaseUrl.TrimEnd('/') + "/api/events/" + api.ActiveEventSlug + "/leaderboard";
                using (UnityWebRequest req = UnityWebRequest.Get(url))
                {
                    yield return req.Send();
                    if (!req.isError && req.responseCode == 200)
                    {
                        try
                        {
                            var result = JsonUtility.FromJson<Result>(req.downloadHandler.text);
                            if (result != null && result.leaderboard != null)
                            {
                                Render(result);
                                try { File.WriteAllText(cache, req.downloadHandler.text); } catch {}
                            }
                        }
                        catch (Exception ex) { Debug.LogWarning("Leaderboard parse error: " + ex.Message); }
                    }
                }
            }
            yield return new WaitForSeconds(Mathf.Max(5, refreshSeconds));
        }
    }

    private void Render(Result data)
    {
        if (board == null || data == null || data.leaderboard == null) return;
        string text = "EVENT LEADERBOARD\n";
        for (int i = 0; i < Mathf.Min(10, data.leaderboard.Length); i++)
            text += (i + 1) + ". " + data.leaderboard[i].name + "    " + data.leaderboard[i].points + "\n";
        board.text = text + "\nProvisional results";
    }
}
