// Renders a check-in URL into a UI RawImage via the ZXing DLL already in Assets/.
// Verify BarcodeWriter compatibility with the bundled ZXing Unity binary in the Editor.
using UnityEngine;
using UnityEngine.UI;
using ZXing;
using ZXing.Common;

public class KioskQrDisplay : MonoBehaviour
{
    public RawImage qrTarget;
    public Text instructions;
    public int qrSize = 320;
    private Texture2D current;
    private long expiresAt;

    void Update()
    {
        if (expiresAt > 0)
        {
            long milliseconds = (long)(System.DateTime.UtcNow - new System.DateTime(1970,1,1,0,0,0,System.DateTimeKind.Utc)).TotalMilliseconds;
            if (milliseconds >= expiresAt) Clear();
        }
    }

    public void SetLink(string url, long validUntil = 0)
    {
        if (qrTarget == null || string.IsNullOrEmpty(url)) return;
        Clear();
        expiresAt = validUntil;
        var writer = new BarcodeWriter
        {
            Format = BarcodeFormat.QR_CODE,
            Options = new EncodingOptions { Width = qrSize, Height = qrSize, Margin = 1 }
        };
        Color32[] pixels = writer.Write(url);
        current = new Texture2D(qrSize, qrSize, TextureFormat.RGBA32, false);
        current.SetPixels32(pixels);
        current.Apply();
        qrTarget.texture = current;
        qrTarget.gameObject.SetActive(true);
        if (instructions != null) instructions.text = "Scan with your phone to join";
    }

    public void Clear()
    {
        expiresAt = 0;
        if (qrTarget != null) { qrTarget.texture = null; qrTarget.gameObject.SetActive(false); }
        if (current != null) { Destroy(current); current = null; }
        if (instructions != null) instructions.text = "";
    }
}
