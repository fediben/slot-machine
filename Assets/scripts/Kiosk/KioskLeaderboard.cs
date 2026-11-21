// Public idle leaderboard. Event-scoped cached standings work without connectivity.
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
        string displayedEvent = null;
        while (true)
        {
            if (api == null || board == null || string.IsNullOrEmpty(api.ActiveEventSlug))
            {
                yield return new WaitForSeconds(5);
                continue;
            }
            string slug = api.ActiveEventSlug;
            if (slug != displayedEvent)
            {
                displayedEvent = slug;
                board.text = "Loading event leaderboard…";
                try
                {
                    string prior = Path.Combine(Application.persistentDataPath, "leaderboard-" + slug + ".json");
                    if (File.Exists(prior)) Render(JsonUtility.FromJson<Result>(File.ReadAllText(prior)));
                }
                catch { board.text = "Leaderboard available when online"; }
            }
            string url = api.ApiBaseUrl.TrimEnd('/') + "/api/events/" + slug + "/leaderboard";
            using (UnityWebRequest req = UnityWebRequest.Get(url))
            {
                yield return req.Send();
                if (!req.isError && req.responseCode == 200)
                {
                    try
                    {
                        var result = JsonUtility.FromJson<Result>(req.downloadHandler.text);
                        if (result != null && result.leaderboard != null && slug == api.ActiveEventSlug)
                        {
                            Render(result);
                            try { File.WriteAllText(Path.Combine(Application.persistentDataPath, "leaderboard-" + slug + ".json"), req.downloadHandler.text); } catch {}
                        }
                    }
                    catch (Exception ex) { Debug.LogWarning("Leaderboard parse error: " + ex.Message); }
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
