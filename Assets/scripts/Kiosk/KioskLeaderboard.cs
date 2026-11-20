// Public idle leaderboard for the new kiosk scene. Attach to a Text field in Unity.
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public class KioskLeaderboard : MonoBehaviour
{
    public KioskApiClient api;
    public Text board;
    public float refreshSeconds = 15;
    [System.Serializable] private class Row { public string name; public int points; public int plays; }
    [System.Serializable] private class Result { public Row[] leaderboard; public bool provisional; }

    IEnumerator Start()
    {
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
                        var result = JsonUtility.FromJson<Result>(req.downloadHandler.text);
                        if (result != null && result.leaderboard != null)
                        {
                            string text = "EVENT LEADERBOARD\n";
                            int count = Mathf.Min(10, result.leaderboard.Length);
                            for (int i = 0; i < count; i++)
                                text += (i + 1) + ". " + result.leaderboard[i].name + "    " + result.leaderboard[i].points + "\n";
                            board.text = text + "\nScores pending validation";
                        }
                    }
                }
            }
            yield return new WaitForSeconds(Mathf.Max(5, refreshSeconds));
        }
    }
}
