// Optional visual theming. Assign RawImage slots only if their layering is safe.
// The default scene does NOT install a full-screen overlay (which could hide the reels).
using System;
using System.IO;
using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Networking;

public class KioskThemeLoader : MonoBehaviour
{
    [Serializable] private class Theme { public string theme; public string background_url; public string logo_url; }
    public KioskApiClient api;
    public RawImage background;
    public RawImage logo;
    public float refreshSeconds = 120;
    private string lastTheme;

    IEnumerator Start()
    {
        while (true)
        {
            if (api != null && !string.IsNullOrEmpty(api.ActiveEventSlug))
            {
                string endpoint = api.ApiBaseUrl.TrimEnd('/') + "/api/events/" + api.ActiveEventSlug + "/theme";
                using (UnityWebRequest req = UnityWebRequest.Get(endpoint))
                {
                    yield return req.Send();
                    if (!req.isError && req.responseCode == 200)
                    {
                        Theme data = JsonUtility.FromJson<Theme>(req.downloadHandler.text);
                        if (data != null && data.theme != lastTheme)
                        {
                            lastTheme = data.theme;
                            if (background != null && !string.IsNullOrEmpty(data.background_url))
                                yield return StartCoroutine(Load(data.background_url, background, "background"));
                            if (logo != null && !string.IsNullOrEmpty(data.logo_url))
                                yield return StartCoroutine(Load(data.logo_url, logo, "logo"));
                        }
                    }
                }
            }
            yield return new WaitForSeconds(Mathf.Max(30, refreshSeconds));
        }
    }

    private IEnumerator Load(string url, RawImage target, string label)
    {
        if (!(url.EndsWith(".png") || url.EndsWith(".jpg") || url.EndsWith(".jpeg"))) yield break;
        string path = Path.Combine(Application.persistentDataPath, "theme-" + label + ".png");
        using (UnityWebRequest req = UnityWebRequest.Get(url))
        {
            yield return req.Send();
            if (req.isError || req.responseCode != 200) yield break;
            byte[] bytes = req.downloadHandler.data;
            Texture2D tex = new Texture2D(2,2,TextureFormat.RGBA32,false);
            if (tex.LoadImage(bytes))
            {
                target.texture = tex;
                try { File.WriteAllBytes(path,bytes); } catch {}
            }
        }
    }
}
